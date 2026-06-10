-- =============================================================================
-- PEMBAYARAN SALDO CUSTOMER — ATOMIK + PESSIMISTIC LOCK
-- =============================================================================
-- Tabel saldo: `wallets` (owner_type = 'customer'), bukan customer_wallets.
-- Mutasi saldo: `wallet_apply_tx` → SELECT ... FOR UPDATE pada baris wallet.
-- Fungsi ini mengunci order + memanggil wallet_apply_tx dalam satu transaksi DB.
-- Jumlah debit SELALU dari kolom order (total_product_amount + delivery_fee),
-- bukan parameter client — cegah manipulasi harga di lapisan pembayaran.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.wallet_pay_pending_order(
  p_customer_id UUID,
  p_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_amount NUMERIC(14, 2);
  v_tx_id UUID;
BEGIN
  -- Kunci baris order — cegah double-pay / race dua tab checkout
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pesanan tidak ditemukan';
  END IF;

  IF v_order.customer_id IS DISTINCT FROM p_customer_id THEN
    RAISE EXCEPTION 'Pesanan tidak ditemukan';
  END IF;

  IF v_order.order_status IS DISTINCT FROM 'pending_payment' THEN
    RAISE EXCEPTION 'Pesanan sudah dibayar atau tidak valid';
  END IF;

  v_amount := COALESCE(v_order.total_product_amount, 0) + COALESCE(v_order.delivery_fee, 0);

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Total pesanan tidak valid';
  END IF;

  -- Debit saldo: wallet_apply_tx mengunci baris wallets FOR UPDATE
  v_tx_id := public.wallet_apply_tx(
    'customer'::public.wallet_owner_type,
    p_customer_id,
    -v_amount,
    'order_payment'::public.wallet_tx_type,
    p_order_id,
    NULL,
    'Pembayaran pesanan (saldo WIRA)'
  );

  UPDATE public.orders
  SET
    order_status = 'paid',
    payment_method = 'wallet',
    payment_gateway = 'wallet',
    snap_token = 'WALLET_' || p_order_id::TEXT
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'order_id', p_order_id,
    'amount', v_amount,
    'wallet_tx_id', v_tx_id
  );
END;
$$;

COMMENT ON FUNCTION public.wallet_pay_pending_order IS
  'Bayar order pending_payment dengan saldo customer: FOR UPDATE order + wallet_apply_tx atomik.';

GRANT EXECUTE ON FUNCTION public.wallet_pay_pending_order TO service_role;
