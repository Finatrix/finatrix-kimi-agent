import { useRef, useEffect } from 'react';

interface OrbitParams {
  a: number;
  b: number;
  rot: number;
}

interface OrbitNode {
  x: number;
  y: number;
  t: number;
  ellipseParams: OrbitParams;
  nodes: NodePoint[];
}

interface NodePoint {
  x: number;
  y: number;
  t: number;
}

interface Connection {
  t: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  pathIndex1: number;
  pathIndex2: number;
  ci: number;
}

interface ConstellationNode {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  vx: number;
  vy: number;
  radius: number;
  glowPhase: number;
}

interface GravityWell {
  x: number;
  y: number;
  strength: number;
  life: number;
}

interface Mouse {
  x: number;
  y: number;
  active: boolean;
}

const ORBIT_CONFIG = {
  ORBIT_SPEED: 1,
  NODE_SIZE: 2,
  PATH_COUNT: 5,
  NODES_PER_PATH: 32,
  CONNECTION_DENSITY: 24,
  DRAW_AXES: false,
};

const FaintGold = 'rgba(212, 175, 55, 0.4)';
const DeepGold = 'rgba(212, 175, 55, 0.08)';
const GRAVITY_WELL_CHANCE = 0.015;
const GRAVITY_WELL_STRENGTH = 1500.0;

function ellipsePoint(t: number, rx: number, ry: number, rot: number) {
  const angle = t * Math.PI * 2;
  const x = rx * Math.cos(angle);
  const y = ry * Math.sin(angle);
  const cosR = Math.cos(rot);
  const sinR = Math.sin(rot);
  return {
    x: x * cosR - y * sinR,
    y: x * sinR + y * cosR,
  };
}

function intersectEllipses(p1: OrbitParams, p2: OrbitParams): boolean {
  const dist = Math.sqrt(
    Math.pow(p1.a - p2.a, 2) + Math.pow(p1.b - p2.b, 2)
  );
  return dist < (p1.a + p1.b + p2.a + p2.b) * 0.5;
}

function initOrbitNodes(): OrbitNode[] {
  const nodes: OrbitNode[] = [];
  for (let i = 0; i < ORBIT_CONFIG.PATH_COUNT; i++) {
    const a = 150 + i * 80;
    const b = 100 + i * 50;
    const rot = (i / ORBIT_CONFIG.PATH_COUNT) * Math.PI;
    const params: OrbitParams = { a, b, rot };
    const pathNodes: NodePoint[] = [];
    for (let j = 0; j < ORBIT_CONFIG.NODES_PER_PATH; j++) {
      const t = j / ORBIT_CONFIG.NODES_PER_PATH;
      const pt = ellipsePoint(t, a, b, rot);
      pathNodes.push({ x: pt.x, y: pt.y, t });
    }
    nodes.push({ x: 0, y: 0, t: 0, ellipseParams: params, nodes: pathNodes });
  }
  return nodes;
}

export function useComputationalLattice() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let time = 0;
    let running = true;
    let nodeSets: OrbitNode[] = [];
    let connectionSets: Connection[][] = [];
    let constellationNodes: ConstellationNode[] = [];
    let hoverNode: ConstellationNode | null = null;
    const mouse: Mouse = { x: 0, y: 0, active: false };
    let gravityWells: GravityWell[] = [];
    let frame = 0;
    let animFrameId: number;

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

    function getDrawCoords(x: number, y: number) {
      return { x: canvas!.width / 2 + x, y: canvas!.height / 2 - y };
    }

    function drawGrid() {
      if (!ctx) return;
      const sp = 50;
      const w = canvas!.width / dpr;
      const h = canvas!.height / dpr;
      const offX = (w / 2) % sp;
      const offY = (h / 2) % sp;
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = '#1A1A1A';
      ctx.lineWidth = 1;
      for (let x = offX; x < w; x += sp) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = offY; y < h; y += sp) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawConstellationNodes() {
      if (!ctx) return;

      // Update gravity wells
      gravityWells = gravityWells.filter(w => {
        w.life -= 1;
        return w.life > 0;
      });

      if (Math.random() < GRAVITY_WELL_CHANCE) {
        gravityWells.push({
          x: (canvas!.width / dpr) / 2 + (Math.random() - 0.5) * 200,
          y: (canvas!.height / dpr) / 2 + (Math.random() - 0.5) * 200,
          strength: GRAVITY_WELL_STRENGTH * (0.5 + Math.random() * 0.5),
          life: 200 + Math.random() * 200,
        });
      }

      for (const node of constellationNodes) {
        let fx = 0;
        let fy = 0;
        const returnForce = 0.02;
        const homeDx = node.baseX - node.x;
        const homeDy = node.baseY - node.y;
        fx += homeDx * returnForce;
        fy += homeDy * returnForce;

        if (mouse.active) {
          const mdx = mouse.x - node.x;
          const mdy = mouse.y - node.y;
          const mdist = Math.sqrt(mdx * mdx + mdy * mdy);
          if (mdist > 5 && mdist < 250) {
            const force = ((250 - mdist) / 250) * 1.5;
            fx += (mdx / mdist) * force;
            fy += (mdy / mdist) * force;
          }
        }

        for (const well of gravityWells) {
          const gdx = well.x - node.x;
          const gdy = well.y - node.y;
          const gDist = Math.sqrt(gdx * gdx + gdy * gdy);
          if (gDist > 10 && gDist < 600) {
            const gForce = (well.strength / (gDist * gDist + 100)) * 0.3;
            fx += (gdx / gDist) * gForce;
            fy += (gdy / gDist) * gForce;
          }
        }

        node.vx = (node.vx + fx) * 0.92;
        node.vy = (node.vy + fy) * 0.92;
        node.x += node.vx;
        node.y += node.vy;

        // Render
        node.glowPhase += 0.05;
        const glowRadius = 15 + Math.sin(node.glowPhase) * 5;
        const gradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, glowRadius);
        gradient.addColorStop(0, 'rgba(212, 175, 55, 0.3)');
        gradient.addColorStop(1, 'rgba(212, 175, 55, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(node.x, node.y, glowRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(245, 245, 240, 0.8)';
        ctx.beginPath();
        ctx.arc(node.x, node.y, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Hover highlight
      hoverNode = null;
      for (const n of constellationNodes) {
        const d = Math.hypot(mouse.x - n.x, mouse.y - n.y);
        if (d < 20) {
          hoverNode = n;
        }
      }
      if (hoverNode) {
        ctx.fillStyle = 'rgba(245, 245, 240, 1.0)';
        ctx.beginPath();
        ctx.arc(hoverNode.x, hoverNode.y, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function drawAxesAndLabels() {
      if (!ORBIT_CONFIG.DRAW_AXES || !ctx) return;
      const w = canvas!.width / dpr;
      const h = canvas!.height / dpr;
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = '#F5F5F0';
      ctx.lineWidth = 1;
      // X axis
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();
      // Y axis
      ctx.beginPath();
      ctx.moveTo(w / 2, 0);
      ctx.lineTo(w / 2, h);
      ctx.stroke();
      ctx.restore();
    }

    function drawOrbits() {
      if (!ctx) return;

      // Draw ellipses
      for (const orbit of nodeSets) {
        const p = orbit.ellipseParams;
        const rx = Math.sqrt(
          (p.a * p.a * p.b * p.b) / (p.b * p.b + p.a * p.a * Math.tan(p.rot) * Math.tan(p.rot))
        );
        const ry = Math.sqrt(
          (p.a * p.a * p.b * p.b) / (p.a * p.a + p.b * p.b / (Math.tan(p.rot) * Math.tan(p.rot) + 1e-10))
        );
        if (isNaN(rx) || isNaN(ry)) continue;

        const c = getDrawCoords(0, 0);
        const grad = ctx.createLinearGradient(c.x - rx, c.y, c.x + rx, c.y);
        grad.addColorStop(0, DeepGold);
        grad.addColorStop(0.5, FaintGold);
        grad.addColorStop(1, DeepGold);

        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(-p.rot);
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();

        // Draw nodes
        for (const node of orbit.nodes) {
          const pos = getDrawCoords(node.x, node.y);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Draw connections - two passes
      const selectedOrbit = 0;
      for (let pass = 0; pass < 2; pass++) {
        for (const connSet of connectionSets) {
          for (const conn of connSet) {
            const isSelected = conn.pathIndex1 === selectedOrbit || conn.pathIndex2 === selectedOrbit;
            if ((pass === 0 && !isSelected) || (pass === 1 && isSelected)) continue;
            const p1 = getDrawCoords(conn.x1, conn.y1);
            const p2 = getDrawCoords(conn.x2, conn.y2);
            ctx.strokeStyle = DeepGold;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        }
      }
    }

    function initScene() {
      nodeSets = initOrbitNodes();
      connectionSets = [];

      for (let pathIndex1 = 0; pathIndex1 < nodeSets.length; pathIndex1++) {
        for (let pathIndex2 = pathIndex1 + 1; pathIndex2 < nodeSets.length; pathIndex2++) {
          const pathConns: Connection[] = [];
          for (let ci = 0; ci < ORBIT_CONFIG.CONNECTION_DENSITY; ci++) {
            const t = ci / ORBIT_CONFIG.CONNECTION_DENSITY;
            const p1 = ellipsePoint(t, ...Object.values(nodeSets[pathIndex1].ellipseParams) as [number, number, number]);
            const p2 = ellipsePoint(t, ...Object.values(nodeSets[pathIndex2].ellipseParams) as [number, number, number]);
            pathConns.push({ t, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, pathIndex1, pathIndex2, ci });
          }
          if (intersectEllipses(nodeSets[pathIndex1].ellipseParams, nodeSets[pathIndex2].ellipseParams)) {
            connectionSets.push(pathConns);
          }
        }
      }

      const selectedOrbit = Math.floor(Math.random() * nodeSets.length);
      constellationNodes = [];
      const nodeSpacing = 4;
      const numConstellationNodes = 8;
      for (let i = 0; i < numConstellationNodes; i++) {
        const nodeRef = nodeSets[selectedOrbit].nodes[i * nodeSpacing];
        if (nodeRef) {
          constellationNodes.push({
            x: nodeRef.x + (canvas!.width / dpr) / 2,
            y: (canvas!.height / dpr) / 2 - nodeRef.y,
            baseX: nodeRef.x + (canvas!.width / dpr) / 2,
            baseY: (canvas!.height / dpr) / 2 - nodeRef.y,
            vx: 0,
            vy: 0,
            radius: 4,
            glowPhase: Math.random() * Math.PI * 2,
          });
        }
      }

      const w = canvas!.width / dpr;
      const h = canvas!.height / dpr;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function animate() {
      if (!running || !ctx) return;
      time += 0.004 * ORBIT_CONFIG.ORBIT_SPEED;

      ctx.fillStyle = 'rgba(10, 10, 10, 1)';
      ctx.fillRect(0, 0, canvas!.width / dpr, canvas!.height / dpr);

      drawGrid();
      drawConstellationNodes();
      drawOrbits();
      drawAxesAndLabels();

      animFrameId = requestAnimationFrame(animate);
      frame += 1;
    }

    function handleResize() {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      initScene();
    }

    function handleMouseMove(e: MouseEvent) {
      const rect = canvas!.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      mouse.active = true;
    }

    function handleMouseLeave() {
      mouse.active = false;
    }

    handleResize();
    initScene();
    animate();

    window.addEventListener('resize', handleResize);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      running = false;
      cancelAnimationFrame(animFrameId);
      window.removeEventListener('resize', handleResize);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  return canvasRef;
}
