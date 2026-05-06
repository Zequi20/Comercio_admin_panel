import { Clock3, ReceiptText, Search } from "lucide-react";

const orderRows = [
  {
    code: "#YP-1048",
    customer: "Laura Benítez",
    time: "Hace 4 min",
    status: "Pendiente",
    pillClass: "pending",
    total: "Gs. 82.000",
  },
  {
    code: "#YP-1047",
    customer: "Diego Vera",
    time: "Hace 12 min",
    status: "Confirmado",
    pillClass: "hot",
    total: "Gs. 46.500",
  },
  {
    code: "#YP-1046",
    customer: "Ana Gómez",
    time: "Hace 21 min",
    status: "Listo",
    pillClass: "done",
    total: "Gs. 128.000",
  },
];

export default function OrdenesPage() {
  return (
    <main className="dashboard-main">
      <div className="dashboard-topbar">
        <div>
          <p className="eyebrow">Órdenes</p>
          <h1 className="dashboard-title">Cola operativa</h1>
          <p className="muted">Seguimiento de pedidos del comercio.</p>
        </div>
        <div className="dashboard-actions">
          <button className="icon-button" type="button" title="Buscar">
            <Search size={18} />
          </button>
          <button className="button-secondary" type="button">
            <Clock3 size={17} />
            Hoy
          </button>
        </div>
      </div>

      <section className="card card-lg">
        <div className="card-header">
          <div>
            <h2 className="card-title">Órdenes recientes</h2>
            <p className="muted">Pedidos pendientes, confirmados y listos.</p>
          </div>
          <span className="pill hot">
            <ReceiptText size={14} />
            3 abiertas
          </span>
        </div>

        <div className="orders-list">
          {orderRows.map((order) => (
            <article className="order-row" key={order.code}>
              <div>
                <div className="order-code">{order.code}</div>
                <div className="order-meta">{order.time}</div>
              </div>
              <div className="order-customer">
                <strong>{order.customer}</strong>
                <div className="order-meta">Delivery · pago online</div>
              </div>
              <span className={`pill ${order.pillClass}`}>{order.status}</span>
              <strong>{order.total}</strong>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
