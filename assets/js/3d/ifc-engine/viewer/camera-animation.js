// Smooth camera transition via Vector3 lerp + lookAt. Cancels in-flight animation.
// Honors prefers-reduced-motion (instant snap).

let _activeAnimation = null;

export function animateCameraTo(camera, controls, targetPosition, targetUp, duration = 400) {
  if (_activeAnimation) {
    cancelAnimationFrame(_activeAnimation.raf);
    _activeAnimation = null;
  }

  const reducedMotion = typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion || duration <= 0) {
    camera.position.copy(targetPosition);
    camera.up.copy(targetUp);
    camera.lookAt(controls.target);
    controls.update();
    return Promise.resolve();
  }

  const startPos = camera.position.clone();
  const startUp = camera.up.clone();
  const startTime = performance.now();

  return new Promise(resolve => {
    function step() {
      const elapsed = performance.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      camera.position.lerpVectors(startPos, targetPosition, ease);
      camera.up.copy(startUp).lerp(targetUp, ease).normalize();
      camera.lookAt(controls.target);
      controls.update();

      if (t < 1) {
        const raf = requestAnimationFrame(step);
        if (_activeAnimation) _activeAnimation.raf = raf;
      } else {
        _activeAnimation = null;
        resolve();
      }
    }
    _activeAnimation = { raf: requestAnimationFrame(step) };
  });
}
