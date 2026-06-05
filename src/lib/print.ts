/** Struk pesanan → thermal 58mm saja */
export function printThermalReceipt() {
  document.body.classList.remove("print-sales");
  document.body.classList.add("print-thermal");
  window.print();
  cleanupPrintMode();
}

/** Laporan penjualan → A4 / printout biasa */
export function printSalesReport() {
  document.body.classList.remove("print-thermal");
  document.body.classList.add("print-sales");
  window.print();
  cleanupPrintMode();
}

function cleanupPrintMode() {
  const done = () => {
    document.body.classList.remove("print-thermal", "print-sales");
  };
  if ("onafterprint" in window) {
    window.addEventListener("afterprint", done, { once: true });
  } else {
    setTimeout(done, 800);
  }
}
