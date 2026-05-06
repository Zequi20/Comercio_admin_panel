import { MapPin, Phone, Plus, Truck } from "lucide-react";

const couriers = [
  {
    name: "Sin repartidor asignado",
    status: "Disponible",
    area: "Centro",
    phone: "Pendiente",
  },
];

export default function RepartidoresPage() {
  return (
    <main className="dashboard-main">
      <div className="dashboard-topbar">
        <div>
          <p className="eyebrow">Repartidores</p>
          <h1 className="dashboard-title">Equipo de entrega</h1>
          <p className="muted">Disponibilidad y cobertura para delivery.</p>
        </div>
        <div className="dashboard-actions">
          <button className="button-tonal" type="button">
            <Plus size={17} />
            Agregar
          </button>
        </div>
      </div>

      <section className="card card-lg">
        <div className="card-header">
          <div>
            <h2 className="card-title">Repartidores</h2>
            <p className="muted">Personas asociadas a entregas del comercio.</p>
          </div>
          <span className="pill pending">1 registro</span>
        </div>

        <div className="quick-actions">
          {couriers.map((courier) => (
            <article className="quick-action" key={courier.name}>
              <span className="icon-surface" aria-hidden="true">
                <Truck size={19} />
              </span>
              <span>
                <strong>{courier.name}</strong>
                <br />
                <span>
                  <MapPin size={13} /> {courier.area} · <Phone size={13} />{" "}
                  {courier.phone}
                </span>
              </span>
              <span className="pill success">{courier.status}</span>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
