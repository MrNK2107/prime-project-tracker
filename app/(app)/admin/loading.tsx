/** Shown while an admin page loads its data: the shape of a page title and a list, so nothing jumps. */
export default function AdminLoading() {
  return (
    <div aria-busy="true" role="status">
      <span className="visually-hidden">Loading</span>
      <div className="skeleton" style={{ height: "2.25rem", width: "min(18rem, 60%)", marginBottom: "0.6rem" }} />
      <div className="skeleton" style={{ height: "1rem", width: "min(30rem, 90%)", marginBottom: "1.75rem" }} />
      <div className="skeleton" style={{ height: "9rem", marginBottom: "1.25rem" }} />
      <div className="skeleton" style={{ height: "14rem" }} />
    </div>
  );
}
