export const PLAYER_R = 0.3;
export const SPEED = 3.2;
export const STOP_TIME = 0.1;

const DECELERATION = SPEED / STOP_TIME;
const FIXED_STEP = 1 / 60;
const SOLVER_PASSES = 4;
const EPSILON = 1e-9;

export function cellBlocked(layout, cx, cz) {
  if (cx < 0 || cz < 0 || cx >= layout.w || cz >= layout.h) return true;
  return layout.cells[cz * layout.w + cx] !== '.';
}

export function collides(layout, x, z, radius = PLAYER_R) {
  const minX = Math.floor(x - radius);
  const maxX = Math.floor(x + radius);
  const minZ = Math.floor(z - radius);
  const maxZ = Math.floor(z + radius);
  for (let j = minZ; j <= maxZ; j++) {
    for (let i = minX; i <= maxX; i++) {
      if (!cellBlocked(layout, i, j)) continue;
      const nx = Math.max(i, Math.min(x, i + 1));
      const nz = Math.max(j, Math.min(z, j + 1));
      const dx = x - nx;
      const dz = z - nz;
      if (dx * dx + dz * dz < radius * radius - EPSILON) return true;
    }
  }
  return false;
}

function resolveCircle(layout, state, radius) {
  for (let pass = 0; pass < SOLVER_PASSES; pass++) {
    let resolved = false;
    const minX = Math.floor(state.x - radius);
    const maxX = Math.floor(state.x + radius);
    const minZ = Math.floor(state.z - radius);
    const maxZ = Math.floor(state.z + radius);

    for (let j = minZ; j <= maxZ; j++) {
      for (let i = minX; i <= maxX; i++) {
        if (!cellBlocked(layout, i, j)) continue;
        const nearestX = Math.max(i, Math.min(state.x, i + 1));
        const nearestZ = Math.max(j, Math.min(state.z, j + 1));
        let nx = state.x - nearestX;
        let nz = state.z - nearestZ;
        const distanceSq = nx * nx + nz * nz;
        if (distanceSq >= radius * radius - EPSILON) continue;

        let penetration;
        const distance = Math.sqrt(distanceSq);
        if (distance > EPSILON) {
          nx /= distance;
          nz /= distance;
          penetration = radius - distance;
        } else {
          // The centre is on/in the box. Choose the shortest deterministic exit
          // from the radius-expanded box; this also handles exact edge contact.
          const exits = [
            { d: state.x - (i - radius), nx: -1, nz: 0 },
            { d: i + 1 + radius - state.x, nx: 1, nz: 0 },
            { d: state.z - (j - radius), nx: 0, nz: -1 },
            { d: j + 1 + radius - state.z, nx: 0, nz: 1 },
          ];
          exits.sort((a, b) => a.d - b.d);
          ({ d: penetration, nx, nz } = exits[0]);
        }

        state.x += nx * penetration;
        state.z += nz * penetration;
        const intoSurface = state.vx * nx + state.vz * nz;
        if (intoSurface < 0) {
          state.vx -= intoSurface * nx;
          state.vz -= intoSurface * nz;
        }
        resolved = true;
      }
    }
    if (!resolved) break;
  }
}

function resolvePlayerCircles(state, others, radius) {
  if (!others || others.length === 0) return;
  for (let pass = 0; pass < SOLVER_PASSES; pass++) {
    let resolved = false;
    for (let index = 0; index < others.length; index++) {
      const other = others[index];
      if (!other || !Number.isFinite(other.x) || !Number.isFinite(other.z)) continue;
      let nx = state.x - other.x;
      let nz = state.z - other.z;
      const distanceSq = nx * nx + nz * nz;
      const minDistance = radius + (Number(other.radius) || radius);
      if (distanceSq >= minDistance * minDistance - EPSILON) continue;

      const distance = Math.sqrt(distanceSq);
      if (distance > EPSILON) {
        nx /= distance;
        nz /= distance;
      } else {
        // Exact overlap is rare (usually a reconnect). Pick a stable escape
        // direction so the pair cannot remain permanently interpenetrating.
        nx = index % 2 === 0 ? 1 : -1;
        nz = 0;
      }
      const penetration = minDistance - distance;
      state.x += nx * penetration;
      state.z += nz * penetration;
      const intoPlayer = state.vx * nx + state.vz * nz;
      if (intoPlayer < 0) {
        state.vx -= intoPlayer * nx;
        state.vz -= intoPlayer * nz;
      }
      resolved = true;
    }
    if (!resolved) break;
  }
}

function normaliseInput(input) {
  let dx = Number(input && input.dx) || 0;
  let dz = Number(input && input.dz) || 0;
  const length = Math.hypot(dx, dz);
  if (length > 1) {
    dx /= length;
    dz /= length;
  }
  return { dx, dz, active: length > 0 };
}

/** Mutates and returns { x, z, vx, vz }. */
export function stepMovement(layout, state, input, dt, radius = PLAYER_R, otherPlayers = []) {
  if (!layout || !state || !(dt > 0)) return state;
  const command = normaliseInput(input);
  state._movementRemainder = (Number(state._movementRemainder) || 0) + dt;
  // Fixed 60Hz slices make corner contacts deterministic across render rates
  // and match the six slices used by each 100ms authoritative tick.
  while (state._movementRemainder + EPSILON >= FIXED_STEP) {
    state._movementRemainder -= FIXED_STEP;
    if (state._movementRemainder < 0) state._movementRemainder = 0;
    let moveX;
    let moveZ;
    if (command.active) {
      state.vx = command.dx * SPEED;
      state.vz = command.dz * SPEED;
      moveX = state.vx * FIXED_STEP;
      moveZ = state.vz * FIXED_STEP;
    } else {
      const speed = Math.hypot(state.vx || 0, state.vz || 0);
      if (speed <= EPSILON) {
        state.vx = 0;
        state.vz = 0;
        state._movementRemainder = 0;
        break;
      }
      const nextSpeed = Math.max(0, speed - DECELERATION * FIXED_STEP);
      const averageSpeed = (speed + nextSpeed) * 0.5;
      const dirX = state.vx / speed;
      const dirZ = state.vz / speed;
      moveX = dirX * averageSpeed * FIXED_STEP;
      moveZ = dirZ * averageSpeed * FIXED_STEP;
      state.vx = dirX * nextSpeed;
      state.vz = dirZ * nextSpeed;
    }

    state.x += moveX;
    state.z += moveZ;
    resolveCircle(layout, state, radius);
    resolvePlayerCircles(state, otherPlayers, radius);
    // A player may push this circle toward a counter or wall. Re-run the map
    // solver so crowding never forces a character through level geometry.
    resolveCircle(layout, state, radius);
  }
  return state;
}

/** Reconciles prediction without treating a stale snapshot as a live target. */
export function reconcilePrediction(layout, predicted, server, input, lastDirection, sentSeq, dt, radius = PLAYER_R) {
  if (!layout || !predicted || !server) return predicted;
  const ex = server.x - predicted.x;
  const ez = server.z - predicted.z;
  const error = Math.hypot(ex, ez);
  if (error > 1.5) {
    predicted.x = server.x;
    predicted.z = server.z;
    predicted.vx = Number(server.vx) || 0;
    predicted.vz = Number(server.vz) || 0;
    predicted._movementRemainder = 0;
    return predicted;
  }
  if (error <= 0.001) return predicted;

  const command = normaliseInput(input);
  const directionLength = Math.hypot(lastDirection.dx || 0, lastDirection.dz || 0);
  const dirX = directionLength > EPSILON ? lastDirection.dx / directionLength : 0;
  const dirZ = directionLength > EPSILON ? lastDirection.dz / directionLength : 0;
  const sideX = -dirZ;
  const sideZ = dirX;

  if (command.active) {
    const lateralError = ex * sideX + ez * sideZ;
    const k = Math.min(1, dt * 4);
    predicted.x += sideX * lateralError * k;
    predicted.z += sideZ * lateralError * k;
    resolveCircle(layout, predicted, radius);
    return predicted;
  }

  const serverStopped = (Number.isSafeInteger(server.moveSeq) ? server.moveSeq : 0) >= sentSeq
    && Math.hypot(Number(server.vx) || 0, Number(server.vz) || 0) < 0.001;
  if (!serverStopped) return predicted;

  const along = ex * dirX + ez * dirZ;
  const lateral = ex * sideX + ez * sideZ;
  const backwardOnly = along < 0 && Math.abs(along) >= Math.abs(lateral);
  if (!backwardOnly || error > 0.25) {
    const k = Math.min(1, dt * 8);
    predicted.x += ex * k;
    predicted.z += ez * k;
    resolveCircle(layout, predicted, radius);
  }
  return predicted;
}
