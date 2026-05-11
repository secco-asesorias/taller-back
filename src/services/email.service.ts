const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@tallersecco.cl';
const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO || EMAIL_FROM;

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function formatDate(value: unknown): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    const [y, m, d] = String(value).split('-');
    return `${d}-${m}-${y}`;
  }
  const date = new Date(String(value));
  return isNaN(date.getTime()) ? String(value)
    : date.toLocaleDateString('es-CL', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function row(label: string, value: unknown): string {
  if (!value) return '';
  return `<tr><td style="padding:8px 0;color:#6B6B6B;font-size:13px;">${escapeHtml(label)}</td><td style="padding:8px 0;color:#111114;font-size:13px;font-weight:600;text-align:right;">${escapeHtml(value)}</td></tr>`;
}

function layout({ title, intro, rows: tableRows, footer, accent = '#a98225' }: {
  title: string; intro: string; rows: string[]; footer: string; accent?: string;
}): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#f4f4f5;">
    <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;font-family:sans-serif;">
      <div style="background:${accent};padding:24px;text-align:center;">
        <h1 style="color:#fff;font-size:20px;margin:0;">SECCO</h1>
      </div>
      <div style="padding:24px;">
        <h2 style="font-size:18px;color:#111114;">${escapeHtml(title)}</h2>
        <p style="color:#444;font-size:14px;">${escapeHtml(intro)}</p>
        <table style="width:100%;border-collapse:collapse;">${tableRows.join('')}</table>
      </div>
      <div style="padding:16px 24px;background:#f9fafb;font-size:12px;color:#888;">${escapeHtml(footer)}</div>
    </div>
  </body></html>`;
}

async function enviarEmail({ to, subject, html }: { to: string; subject: string; html: string }): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY no configurado — email omitido');
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: EMAIL_FROM, reply_to: EMAIL_REPLY_TO, to, subject, html }),
  });
  if (!res.ok) throw new Error(`Error Resend: ${await res.text()}`);
}

type ActaData = { numero_acta?: unknown; fecha_ingreso?: unknown; trabajo_solicitado?: unknown; clientes?: { email?: string; nombre?: string }; vehiculos?: { marca?: string; modelo?: string; patente?: string } };
type OTData = { numero_ot?: unknown; tecnico_nombre?: unknown; clientes?: { email?: string; nombre?: string }; vehiculos?: { marca?: string; modelo?: string; patente?: string } };

export async function notificarIngresoActa(acta: ActaData): Promise<void> {
  const email = acta.clientes?.email;
  if (!email) return;
  const html = layout({
    title: 'Vehículo ingresado a SECCO',
    intro: `Estimado/a ${acta.clientes?.nombre || ''}, su vehículo ha ingresado correctamente.`,
    rows: [
      row('N° Acta', `#${acta.numero_acta}`),
      row('Fecha', formatDate(acta.fecha_ingreso)),
      row('Vehículo', `${acta.vehiculos?.marca || ''} ${acta.vehiculos?.modelo || ''}`.trim()),
      row('Patente', acta.vehiculos?.patente),
      row('Trabajo solicitado', acta.trabajo_solicitado),
    ],
    footer: 'Taller SECCO — gracias por su confianza.',
    accent: '#a98225',
  });
  await enviarEmail({ to: email, subject: `Acta de ingreso #${acta.numero_acta} — SECCO`, html });
}

export async function notificarInicioMantencion(ot: OTData): Promise<void> {
  const email = ot.clientes?.email;
  if (!email) return;
  const html = layout({
    title: 'Mantención iniciada',
    intro: `Estimado/a ${ot.clientes?.nombre || ''}, su vehículo está siendo atendido.`,
    rows: [
      row('OT', `#${ot.numero_ot}`),
      row('Patente', ot.vehiculos?.patente),
      row('Vehículo', `${ot.vehiculos?.marca || ''} ${ot.vehiculos?.modelo || ''}`.trim()),
      row('Técnico', ot.tecnico_nombre),
    ],
    footer: 'Taller SECCO — le avisaremos cuando esté listo.',
    accent: '#5064c8',
  });
  await enviarEmail({ to: email, subject: `Mantención iniciada OT #${ot.numero_ot} — SECCO`, html });
}

export async function notificarMantencionFinalizada(ot: OTData): Promise<void> {
  const email = ot.clientes?.email;
  if (!email) return;
  const html = layout({
    title: 'Mantención finalizada',
    intro: `Estimado/a ${ot.clientes?.nombre || ''}, su vehículo está listo para retiro.`,
    rows: [
      row('OT', `#${ot.numero_ot}`),
      row('Patente', ot.vehiculos?.patente),
      row('Vehículo', `${ot.vehiculos?.marca || ''} ${ot.vehiculos?.modelo || ''}`.trim()),
    ],
    footer: 'Taller SECCO — gracias por su preferencia.',
    accent: '#228b50',
  });
  await enviarEmail({ to: email, subject: `Vehículo listo OT #${ot.numero_ot} — SECCO`, html });
}
