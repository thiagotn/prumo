'use client';

// The signature pad: a canvas the patient draws on with a finger or a mouse, which hands
// the drawing to the form as a PNG data URL in a hidden input.
//
// Pointer events rather than touch plus mouse: one code path for the phone at the counter
// and the mouse in the back office. `touch-action: none` is what stops the browser
// scrolling the page instead of drawing the line.
import { useCallback, useEffect, useRef, useState } from 'react';

export type SignaturePadProps = {
  /** Name of the hidden input the form submits. */
  name: string;
  label: string;
  hint?: string;
};

export function SignaturePad({ name, label, hint }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [value, setValue] = useState('');

  // The canvas is sized in device pixels but laid out in CSS pixels; without the scale
  // the line lands away from the finger on a phone.
  const prepare = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.scale(ratio, ratio);
    context.lineWidth = 2;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    // Read from the page so the accent colour of the clinic is what signs.
    context.strokeStyle = getComputedStyle(canvas).color || '#1a1a1a';
  }, []);

  useEffect(() => {
    prepare();
    window.addEventListener('resize', prepare);
    return () => window.removeEventListener('resize', prepare);
  }, [prepare]);

  const pointFrom = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const context = canvasRef.current?.getContext('2d');
    if (!context) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    const { x, y } = pointFrom(event);
    context.beginPath();
    context.moveTo(x, y);
  };

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const context = canvasRef.current?.getContext('2d');
    if (!context) return;
    const { x, y } = pointFrom(event);
    context.lineTo(x, y);
    context.stroke();
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current;
    if (canvas) setValue(canvas.toDataURL('image/png'));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    setValue('');
  };

  return (
    <div className="field">
      <label htmlFor={`${name}-pad`}>{label}</label>
      <canvas
        id={`${name}-pad`}
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={end}
        aria-label={label}
        style={{
          width: '100%',
          height: 160,
          touchAction: 'none',
          cursor: 'crosshair',
          border: '1px solid var(--color-divider)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--color-bg)',
          color: 'var(--color-text)',
        }}
      />
      <input type="hidden" name={name} value={value} />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
          marginTop: 'var(--space-2)',
        }}
      >
        <button className="btn btn-secondary touch" type="button" onClick={clear}>
          Limpar
        </button>
        <span style={{ fontSize: 11, color: 'var(--color-neutral-600)' }}>
          {value ? 'Assinatura registrada.' : (hint ?? 'Assine com o dedo ou com o mouse.')}
        </span>
      </div>
    </div>
  );
}
