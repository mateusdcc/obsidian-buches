function graphLayout(nodes, width, height) {
  const positions = new Map();
  const count = nodes.length;
  const cx = width / 2, cy = height / 2;
  for (let i = 0; i < count; i++) {
    if (count === 1) { positions.set(nodes[i].path, {x:cx, y:cy}); continue; }
    const angle = i * Math.PI * (3 - Math.sqrt(5));
    const radius = Math.sqrt((i + 0.7) / count) * 0.83;
    const width = Math.max(0, cx - 14), height = Math.max(0, cy - 14);
    positions.set(nodes[i].path, {
      x: cx + Math.cos(angle) * radius * width,
      y: cy + Math.sin(angle) * radius * height,
    });
  }
  return positions;
}
module.exports = { graphLayout };
