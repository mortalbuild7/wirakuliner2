-- Bagi hasil: markup produk merchant + komisi driver 10%

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS merchant_product_amount NUMERIC(14, 2) NOT NULL DEFAULT 0
    CHECK (merchant_product_amount >= 0),
  ADD COLUMN IF NOT EXISTS platform_markup_amount NUMERIC(14, 2) NOT NULL DEFAULT 0
    CHECK (platform_markup_amount >= 0);

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS merchant_unit_price NUMERIC(12, 2)
    CHECK (merchant_unit_price IS NULL OR merchant_unit_price >= 0);

COMMENT ON COLUMN public.orders.merchant_product_amount IS
  'Total harga dasar merchant (tanpa markup aplikasi)';
COMMENT ON COLUMN public.orders.platform_markup_amount IS
  'Total markup aplikasi per produk (Rp 1.000 × qty)';
COMMENT ON COLUMN public.order_items.merchant_unit_price IS
  'Harga input merchant per unit saat order dibuat';
COMMENT ON COLUMN public.order_items.price IS
  'Harga yang dibayar customer per unit (merchant + markup)';

-- Settlement Midtrans: merchant dapat harga dasar, driver 90% ongkir, aplikasi markup + 10% ongkir
CREATE OR REPLACE FUNCTION public.process_midtrans_settlement(
  p_midtrans_order_id TEXT,
  p_gross_amount NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pt public.payment_transactions%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_driver_net NUMERIC(14, 2);
  v_driver_platform NUMERIC(14, 2);
  v_food_platform NUMERIC(14, 2);
BEGIN
  SELECT * INTO v_pt
  FROM public.payment_transactions
  WHERE midtrans_order_id = p_midtrans_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'payment_not_found');
  END IF;

  IF v_pt.status = 'settlement' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'already_settled', true,
      'payment_type', v_pt.payment_type,
      'order_id', v_pt.order_id
    );
  END IF;

  IF ABS(v_pt.gross_amount - p_gross_amount) > 0.01 THEN
    RAISE EXCEPTION 'Nominal pembayaran tidak sesuai';
  END IF;

  IF v_pt.payment_type = 'topup' THEN
    PERFORM public.wallet_apply_tx(
      'customer',
      v_pt.customer_id,
      p_gross_amount,
      'topup_qris',
      NULL,
      p_midtrans_order_id,
      'Top up QRIS Midtrans'
    );

    UPDATE public.payment_transactions
    SET status = 'settlement', settled_at = NOW()
    WHERE id = v_pt.id;

    RETURN jsonb_build_object(
      'ok', true,
      'payment_type', 'topup',
      'customer_id', v_pt.customer_id
    );
  END IF;

  IF v_pt.order_id IS NULL THEN
    RAISE EXCEPTION 'Order tidak terhubung';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = v_pt.order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order tidak ditemukan';
  END IF;

  IF v_order.order_status <> 'paid' THEN
    UPDATE public.orders
    SET
      order_status = 'paid',
      payment_method = 'gateway',
      payment_gateway = 'midtrans_qris',
      snap_token = p_midtrans_order_id
    WHERE id = v_order.id;
  END IF;

  -- NGOJEK: 90% ongkir ke driver, 10% aplikasi
  IF v_pt.payment_type = 'ngojek' THEN
    v_driver_platform := ROUND(v_order.delivery_fee * 0.10, 2);
    v_driver_net := GREATEST(v_order.delivery_fee - v_driver_platform, 0);

    UPDATE public.payment_transactions
    SET
      status = 'settlement',
      settled_at = NOW(),
      platform_fee = v_driver_platform,
      driver_share = v_driver_net,
      merchant_share = 0,
      merchant_share_paid = FALSE
    WHERE id = v_pt.id;

    RETURN jsonb_build_object(
      'ok', true,
      'payment_type', 'ngojek',
      'order_id', v_order.id,
      'driver_share', v_driver_net,
      'platform_fee', v_driver_platform,
      'notify_drivers', true
    );
  END IF;

  -- Kuliner: merchant = harga input, aplikasi = markup produk + 10% ongkir
  v_pt.merchant_share := COALESCE(
    NULLIF(v_order.merchant_product_amount, 0),
    v_order.total_product_amount
  );
  v_food_platform := COALESCE(v_order.platform_markup_amount, 0);

  v_driver_platform := ROUND(v_order.delivery_fee * 0.10, 2);
  v_driver_net := GREATEST(v_order.delivery_fee - v_driver_platform, 0);
  v_pt.driver_share := v_driver_net;
  v_pt.platform_fee := v_food_platform + v_driver_platform;

  IF v_pt.merchant_share > 0 AND NOT v_pt.merchant_share_paid THEN
    PERFORM public.wallet_apply_tx(
      'merchant',
      v_order.merchant_id,
      v_pt.merchant_share,
      'order_earning',
      v_order.id,
      NULL,
      'Pembayaran kuliner QRIS (harga merchant)'
    );
    v_pt.merchant_share_paid := TRUE;
  END IF;

  UPDATE public.payment_transactions
  SET
    status = 'settlement',
    settled_at = NOW(),
    platform_fee = v_pt.platform_fee,
    merchant_share = v_pt.merchant_share,
    driver_share = v_pt.driver_share,
    merchant_share_paid = v_pt.merchant_share_paid
  WHERE id = v_pt.id;

  RETURN jsonb_build_object(
    'ok', true,
    'payment_type', 'food',
    'order_id', v_order.id,
    'merchant_share', v_pt.merchant_share,
    'driver_share', v_pt.driver_share,
    'platform_fee', v_pt.platform_fee,
    'notify_drivers', true
  );
END;
$$;
