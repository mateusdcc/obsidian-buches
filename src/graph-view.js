const { graphLayout } = require('./graph-layout');
const SVG = 'http://www.w3.org/2000/svg';

function renderGraph(container, graph, currentPath, openFile, isDone = () => false) {
  if (!graph.nodes.length) {
    container.createEl('p', {cls:'buches-context-empty', text:'No concepts yet.'});
    return;
  }
  const doc = container.ownerDocument;
  const svg = doc.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 320 165');
  svg.setAttribute('class', 'buches-graph');
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-label', 'Concept dependency graph');
  const positions = graphLayout(graph.nodes, 320, 165);
  for (const edge of graph.edges) {
    const source = positions.get(edge.source), target = positions.get(edge.target);
    if (!source || !target) continue;
    const line = doc.createElementNS(SVG, 'line');
    for (const [key, value] of Object.entries({x1:source.x,y1:source.y,x2:target.x,y2:target.y})) line.setAttribute(key, String(value));
    line.setAttribute('class', `buches-graph-edge is-${edge.type}`);
    const tooltip = doc.createElementNS(SVG, 'title');
    const sourceName = graph.nodes.find(node => node.path === edge.source)?.name ?? edge.source;
    const targetName = graph.nodes.find(node => node.path === edge.target)?.name ?? edge.target;
    tooltip.textContent = edge.type === 'dependency' ? `${sourceName} depends on ${targetName}` : edge.type === 'hierarchy' ? `${targetName} is nested under ${sourceName}` : `${sourceName} links to ${targetName}`;
    line.appendChild(tooltip);
    svg.appendChild(line);
  }
  for (const node of graph.nodes) {
    const point = positions.get(node.path);
    const group = doc.createElementNS(SVG, 'g');
    group.setAttribute('class', `buches-graph-node${node.path === currentPath ? ' is-current' : ''}${isDone(node) ? ' is-mastered' : ''}`);
    group.setAttribute('role', 'button');
    group.setAttribute('tabindex', '0');
    group.setAttribute('aria-label', `Open concept ${node.name}`);
    const title = doc.createElementNS(SVG, 'title'); title.textContent = node.name; group.appendChild(title);
    const circle = doc.createElementNS(SVG, 'circle');
    circle.setAttribute('cx', String(point.x)); circle.setAttribute('cy', String(point.y)); circle.setAttribute('r', '4.5');
    group.appendChild(circle);
    group.addEventListener('click', () => openFile(node.file));
    group.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openFile(node.file); }
    });
    svg.appendChild(group);
  }
  container.appendChild(svg);
}
module.exports = { renderGraph };
