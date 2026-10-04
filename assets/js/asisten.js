function renderBlockingGrid() {
  const grid = document.querySelectorAll(".bl-cell");
  if (!grid.length) return;

  grid.forEach((cell) => {
    cell.addEventListener("click", () => {
      const idx = Number(cell.dataset.cell);
      const active = cell.classList.contains("bg-primary-container");
      document.querySelectorAll(".bl-cell").forEach((x) => {
        x.classList.remove("bg-primary-container", "text-primary");
        x.classList.add("bg-surface-container", "text-on-surface");
      });
      if (!active) {
        cell.classList.remove("bg-surface-container", "text-on-surface");
        cell.classList.add("bg-primary-container", "text-primary");
      }
    });
  });
}
