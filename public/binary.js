(() => {
  const canvas = document.querySelector('.binary-rain');
  if (!canvas) return;
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) return;
  const glyphs = '0123456789';
  let width = 0;
  let height = 0;
  let columns = [];
  let frame = 0;
  let active = true;
  const fontSize = 14;

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    columns = Array.from({ length: Math.ceil(width / fontSize) }, () => Math.random() * -height / fontSize);
  }
  function draw() {
    if (!active) return;
    context.fillStyle = 'rgba(20, 1, 38, 0.13)';
    context.fillRect(0, 0, width, height);
    context.font = `${fontSize}px monospace`;
    context.fillStyle = '#8d35ff';
    for (let index = 0; index < columns.length; index += 2) {
      const digit = glyphs[Math.floor(Math.random() * glyphs.length)];
      const y = columns[index] * fontSize;
      context.fillText(digit, index * fontSize, y);
      if (y > height && Math.random() > 0.975) columns[index] = 0;
      columns[index] += 0.28 + Math.random() * 0.42;
    }
    frame = window.requestAnimationFrame(draw);
  }
  document.addEventListener('visibilitychange', () => {
    active = !document.hidden;
    if (active) draw();
    else window.cancelAnimationFrame(frame);
  });
  window.addEventListener('resize', resize, { passive: true });
  resize();
  draw();
})();
