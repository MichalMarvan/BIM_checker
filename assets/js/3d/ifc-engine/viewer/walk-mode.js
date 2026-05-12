// Phase 6.5.1 — Walk mode (FPS-style first-person navigation).
//
// Controls:
//   W/A/S/D     — move forward/left/back/right (XZ plane)
//   Mouse drag  — yaw + pitch (also pointer-lock supported)
//   Space       — jump
//   Shift       — run (1.8x speed)
//   Q / E       — manual fly up/down (when gravity disabled)
//   ESC         — exit walk mode
//
// Physics:
//   gravity = -9.81 m/s²
//   eye height = 1.7m above ground (raycast down from camera)
//   move speed = 3 m/s walk, 5.4 m/s run
//   collision raycast forward: if hit within 0.4m, slide along surface normal
//
// OrbitControls is disabled while walking. On exit, controls re-enabled and
// camera target is set 5m in front of camera so orbit doesn't snap.

import * as THREE from 'three';

const GRAVITY = -9.81;
const WALK_SPEED = 3.0;
const RUN_SPEED = 5.4;
const JUMP_VELOCITY = 4.5;
const EYE_HEIGHT = 1.7;
const COLLISION_RADIUS = 0.4;
const MOUSE_SENSITIVITY = 0.0025;

export class WalkMode {
  constructor(viewerCore) {
    this._viewer = viewerCore;
    this._active = false;
    this._keys = new Set();
    this._velocityY = 0;
    this._yaw = 0;
    this._pitch = 0;
    this._lastTime = null;
    this._raycaster = new THREE.Raycaster();
    this._mouseDownPos = null;
    this._draggingLook = false;
    this._gravityEnabled = true;

    // Bound handlers (so we can remove them later)
    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onKeyUp = this._handleKeyUp.bind(this);
    this._onMouseDown = this._handleMouseDown.bind(this);
    this._onMouseMove = this._handleMouseMove.bind(this);
    this._onMouseUp = this._handleMouseUp.bind(this);
  }

  isActive() { return this._active; }
  setGravityEnabled(enabled) { this._gravityEnabled = !!enabled; }

  start() {
    if (this._active) return;
    this._active = true;
    this._velocityY = 0;
    this._lastTime = null;

    // Initialize yaw/pitch from current camera orientation
    const cam = this._viewer._camera;
    const target = this._viewer._controls.target;
    const dir = new THREE.Vector3().subVectors(target, cam.position).normalize();
    this._yaw = Math.atan2(-dir.x, -dir.z);
    this._pitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));

    // Disable orbit controls
    this._viewer._controls.enabled = false;

    // Listeners
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    const canvas = this._viewer._canvas;
    canvas.addEventListener('pointerdown', this._onMouseDown);
    window.addEventListener('pointermove', this._onMouseMove);
    window.addEventListener('pointerup', this._onMouseUp);
  }

  stop() {
    if (!this._active) return;
    this._active = false;
    this._keys.clear();

    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    const canvas = this._viewer._canvas;
    canvas.removeEventListener('pointerdown', this._onMouseDown);
    window.removeEventListener('pointermove', this._onMouseMove);
    window.removeEventListener('pointerup', this._onMouseUp);

    // Re-enable orbit + reset target ahead of camera so zoom etc. feels natural
    const controls = this._viewer._controls;
    const cam = this._viewer._camera;
    const dir = this._getLookDirection();
    controls.target.copy(cam.position).addScaledVector(dir, 5);
    controls.enabled = true;
    controls.update();
  }

  /** Per-frame tick called from render loop. */
  tick() {
    if (!this._active) return;
    const now = performance.now();
    const dt = this._lastTime != null ? Math.min((now - this._lastTime) / 1000, 0.1) : 0;
    this._lastTime = now;
    if (dt === 0) return;

    const cam = this._viewer._camera;
    const speed = this._keys.has('shift') ? RUN_SPEED : WALK_SPEED;
    const dir = this._getLookDirection();
    // Project to XZ plane for horizontal movement
    const forward = new THREE.Vector3(dir.x, 0, dir.z).normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    // Compute desired horizontal motion
    const move = new THREE.Vector3();
    if (this._keys.has('w')) move.add(forward);
    if (this._keys.has('s')) move.sub(forward);
    if (this._keys.has('d')) move.add(right);
    if (this._keys.has('a')) move.sub(right);
    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(speed * dt);
      // Forward collision: short raycast in move direction
      this._raycaster.set(cam.position, move.clone().normalize());
      this._raycaster.far = COLLISION_RADIUS + move.length();
      const meshes = this._collectModelMeshes();
      const hits = this._raycaster.intersectObjects(meshes, false);
      if (hits.length > 0 && hits[0].distance < COLLISION_RADIUS + move.length()) {
        // Slide along surface: project move onto plane perpendicular to hit normal
        const normal = hits[0].face?.normal
          ? hits[0].face.normal.clone().transformDirection(hits[0].object.matrixWorld).normalize()
          : null;
        if (normal) {
          const slid = move.clone().sub(normal.multiplyScalar(move.dot(normal)));
          cam.position.add(slid);
        }
      } else {
        cam.position.add(move);
      }
    }

    // Vertical: gravity + jump (or manual fly with Q/E if gravity off)
    if (this._gravityEnabled) {
      this._velocityY += GRAVITY * dt;
      cam.position.y += this._velocityY * dt;

      // Ground raycast: from a point above camera, downward, find ground
      const probe = cam.position.clone(); probe.y += 0.1;
      this._raycaster.set(probe, new THREE.Vector3(0, -1, 0));
      this._raycaster.far = 100;
      const meshes = this._collectModelMeshes();
      const hits = this._raycaster.intersectObjects(meshes, false);
      if (hits.length > 0) {
        const groundY = hits[0].point.y;
        const eyeY = groundY + EYE_HEIGHT;
        if (cam.position.y < eyeY) {
          cam.position.y = eyeY;
          this._velocityY = 0;
        }
      }
    } else {
      // Free fly with Q/E
      if (this._keys.has('q')) cam.position.y -= speed * dt;
      if (this._keys.has('e')) cam.position.y += speed * dt;
    }

    // Apply yaw/pitch to camera orientation
    cam.rotation.order = 'YXZ';
    cam.rotation.y = this._yaw;
    cam.rotation.x = this._pitch;
    cam.rotation.z = 0;
  }

  _getLookDirection() {
    return new THREE.Vector3(
      -Math.sin(this._yaw) * Math.cos(this._pitch),
      Math.sin(this._pitch),
      -Math.cos(this._yaw) * Math.cos(this._pitch),
    );
  }

  _collectModelMeshes() {
    const out = [];
    for (const { meshes } of this._viewer._models.values()) {
      for (const m of meshes) {
        if (m.visible) out.push(m);
      }
    }
    return out;
  }

  _handleKeyDown(e) {
    if (!this._active) return;
    if (e.key === 'Escape') { this.stop(); return; }
    const k = e.key.toLowerCase();
    if (k === ' ') {
      // Jump only when on ground (velocityY ~= 0)
      if (Math.abs(this._velocityY) < 0.1) this._velocityY = JUMP_VELOCITY;
      e.preventDefault();
      return;
    }
    if (['w', 'a', 's', 'd', 'q', 'e', 'shift'].includes(k)) {
      this._keys.add(k);
      e.preventDefault();
    }
  }

  _handleKeyUp(e) {
    if (!this._active) return;
    const k = e.key.toLowerCase();
    if (this._keys.has(k)) this._keys.delete(k);
  }

  _handleMouseDown(e) {
    if (!this._active) return;
    if (e.button !== 0) return;
    this._mouseDownPos = { x: e.clientX, y: e.clientY };
    this._draggingLook = true;
  }

  _handleMouseMove(e) {
    if (!this._active || !this._draggingLook || !this._mouseDownPos) return;
    const dx = e.clientX - this._mouseDownPos.x;
    const dy = e.clientY - this._mouseDownPos.y;
    this._mouseDownPos = { x: e.clientX, y: e.clientY };
    this._yaw -= dx * MOUSE_SENSITIVITY;
    this._pitch -= dy * MOUSE_SENSITIVITY;
    this._pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this._pitch));
  }

  _handleMouseUp() {
    this._draggingLook = false;
    this._mouseDownPos = null;
  }
}
