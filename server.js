require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html' }));

// ── AUTH ──
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return res.status(401).json({ error: error.message });
  res.json({ session: data.session, user: data.user });
});

app.post('/api/auth/logout', async (req, res) => {
  await supabase.auth.signOut();
  res.json({ ok: true });
});

// Middleware : vérifier le token
async function auth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Non authentifié' });
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Token invalide' });
  req.user = user;
  req.token = token;
  req.sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  next();
}

// Middleware : vérifier admin
async function adminOnly(req, res, next) {
  const { data: membre } = await req.sb.from('membres').select('role').eq('auth_id', req.user.id).single();
  if (!membre || membre.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
  next();
}

// ── MEMBRES ──
app.get('/api/membres', auth, async (req, res) => {
  const { data, error } = await req.sb.from('membres').select('*').order('nom');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/api/membres/me', auth, async (req, res) => {
  const { data, error } = await req.sb.from('membres').select('*').eq('auth_id', req.user.id).single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/membres', auth, adminOnly, async (req, res) => {
  const { prenom, nom, email, tel, qualifications, role, color } = req.body;
  // Créer compte auth
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email, password: Math.random().toString(36).slice(-10),
    email_confirm: true
  });
  if (authError) return res.status(500).json({ error: authError.message });
  const { data, error } = await req.sb.from('membres').insert({
    prenom, nom, email, tel,
    qualifications: qualifications || [],
    role: role || 'benevole',
    color: color || '#1A5A9A',
    auth_id: authData.user.id
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.put('/api/membres/:id', auth, adminOnly, async (req, res) => {
  const { prenom, nom, tel, qualifications, role, color } = req.body;
  const { data, error } = await req.sb.from('membres').update({ prenom, nom, tel, qualifications, role, color }).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── ÉVÉNEMENTS ──
app.get('/api/evenements', auth, async (req, res) => {
  const { data, error } = await req.sb.from('evenements').select('*').order('date');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/evenements', auth, adminOnly, async (req, res) => {
  const { nom, type, date, heure_debut, heure_fin, lieu, contact_organisateur, instructions_acces, protocoles, vehicules, postes } = req.body;
  const { data, error } = await req.sb.from('evenements').insert({
    nom, type, date, heure_debut, heure_fin, lieu,
    contact_organisateur, instructions_acces, protocoles,
    vehicules: vehicules || [],
    postes: postes || []
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.put('/api/evenements/:id', auth, adminOnly, async (req, res) => {
  const { nom, type, date, heure_debut, heure_fin, lieu, contact_organisateur, instructions_acces, protocoles, vehicules, postes } = req.body;
  const { data, error } = await req.sb.from('evenements').update({
    nom, type, date, heure_debut, heure_fin, lieu,
    contact_organisateur, instructions_acces, protocoles, vehicules, postes
  }).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/evenements/:id', auth, adminOnly, async (req, res) => {
  const { error } = await req.sb.from('evenements').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── DISPONIBILITÉS ──
app.get('/api/disponibilites', auth, async (req, res) => {
  const { data, error } = await req.sb.from('disponibilites').select('*, membres(prenom, nom, qualifications, color), evenements(nom, date)');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/disponibilites', auth, async (req, res) => {
  const { evenement_id, membre_id, statut } = req.body;
  const { data, error } = await req.sb.from('disponibilites').upsert({ evenement_id, membre_id, statut }, { onConflict: 'evenement_id,membre_id' }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── AFFECTATIONS ──
app.get('/api/affectations', auth, async (req, res) => {
  const { data, error } = await req.sb.from('affectations').select('*, membres(prenom, nom, qualifications, color)');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/affectations', auth, adminOnly, async (req, res) => {
  const { evenement_id, membre_id, poste } = req.body;
  const { data, error } = await req.sb.from('affectations').insert({ evenement_id, membre_id, poste }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/affectations/:id', auth, adminOnly, async (req, res) => {
  const { error } = await req.sb.from('affectations').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── ORDRES DE MISSION ──
app.get('/api/ordres/:id/pdf', auth, async (req, res) => {
  try {
    const { data: om } = await req.sb.from('ordres_mission').select('*, evenements(*)').eq('id', req.params.id).single();
    const { data: affectations } = await req.sb.from('affectations').select('*, membres(prenom, nom, qualifications)').eq('evenement_id', om.evenement_id);
    const evt = om.evenements;
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${om.numero}.pdf"`);
    doc.pipe(res);
    doc.fontSize(20).fillColor('#C0392B').text('SECOURISTES DU SUD', { align: 'center' });
    doc.fontSize(10).fillColor('#666').text('Nîmes — Agrément sécurité civile', { align: 'center' });
    doc.moveDown();
    doc.fontSize(16).fillColor('#000').text(`Ordre de mission — ${om.numero}`, { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).fillColor('#C0392B').text('INFORMATIONS ÉVÉNEMENT');
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke('#C0392B');
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor('#000');
    doc.text(`Événement : ${evt.nom}`);
    doc.text(`Type : ${evt.type}`);
    doc.text(`Date : ${new Date(evt.date+'T00:00:00').toLocaleDateString('fr-FR')}`);
    doc.text(`Horaires : ${evt.heure_debut} – ${evt.heure_fin}`);
    doc.text(`Lieu : ${evt.lieu || '—'}`);
    doc.text(`Contact organisateur : ${evt.contact_organisateur || '—'}`);
    if (evt.instructions_acces) { doc.moveDown(0.5); doc.fontSize(12).fillColor('#C0392B').text("INSTRUCTIONS D'ACCÈS"); doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke('#C0392B'); doc.moveDown(0.5); doc.fontSize(11).fillColor('#000').text(evt.instructions_acces); }
    if (evt.protocoles) { doc.moveDown(0.5); doc.fontSize(12).fillColor('#C0392B').text('CONSIGNES MÉDICALES'); doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke('#C0392B'); doc.moveDown(0.5); doc.fontSize(11).fillColor('#000').text(evt.protocoles); }
    doc.moveDown(0.5);
    doc.fontSize(12).fillColor('#C0392B').text('VÉHICULES AFFECTÉS');
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke('#C0392B');
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor('#000').text((evt.vehicules || []).join(' — ') || '—');
    doc.moveDown(0.5);
    doc.fontSize(12).fillColor('#C0392B').text('PERSONNEL AFFECTÉ');
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke('#C0392B');
    doc.moveDown(0.5);
    (affectations || []).forEach(a => {
      doc.fontSize(11).fillColor('#000').text(`• ${a.membres.prenom} ${a.membres.nom} — ${a.poste}`);
    });
    doc.moveDown();
    doc.fontSize(12).fillColor('#C0392B').text('SIGNATURES');
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke('#C0392B');
    doc.moveDown();
    doc.fontSize(11).fillColor('#000').text('Responsable association :', 50, doc.y);
    doc.text('Chef de poste :', 300, doc.y - doc.currentLineHeight());
    doc.moveDown(3);
    doc.moveTo(50, doc.y).lineTo(230, doc.y).stroke('#999');
    doc.moveTo(300, doc.y).lineTo(480, doc.y).stroke('#999');
    doc.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ordres', auth, adminOnly, async (req, res) => {
  const { evenement_id } = req.body;
  const numero = 'OM-' + new Date().getFullYear() + '-' + String(Date.now()).slice(-4);
  const { data, error } = await req.sb.from('ordres_mission').insert({ evenement_id, numero }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.put('/api/ordres/:id/signer', auth, async (req, res) => {
  const { qui } = req.body;
  const update = {};
  if (qui === 'responsable') update.sig_responsable = true;
  if (qui === 'chef') update.sig_chef = true;
  const { data: current } = await req.sb.from('ordres_mission').select('sig_responsable, sig_chef').eq('id', req.params.id).single();
  if (current) {
    const sigResp = update.sig_responsable || current.sig_responsable;
    const sigChef = update.sig_chef || current.sig_chef;
    if (sigResp && sigChef) update.signe = true;
  }
  const { data, error } = await req.sb.from('ordres_mission').update(update).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── PDF ──
app.get('/api/ordres/:id/pdf', auth, async (req, res) => {
  try {
    const { data: om } = await req.sb.from('ordres_mission').select('*, evenements(*)').eq('id', req.params.id).single();
    const { data: affectations } = await req.sb.from('affectations').select('*, membres(prenom, nom, qualifications)').eq('evenement_id', om.evenement_id);
    const evt = om.evenements;

    const html = generatePDFHtml(om, evt, affectations || []);

    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' } });
    await browser.close();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${om.numero}.pdf"`);
    res.send(pdf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function generatePDFHtml(om, evt, affectations) {
  const dateEvt = new Date(evt.date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  const personnelRows = affectations.map(a =>
    `<tr><td>${a.membres.prenom} ${a.membres.nom}</td><td>${a.poste}</td><td>${(a.membres.qualifications||[]).join(', ')}</td></tr>`
  ).join('');
  const vehiculesHtml = (evt.vehicules||[]).map(v => `<span class="badge">${v}</span>`).join(' ');

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; font-size: 12px; color: #1A1917; }
    .header { background: #1A1917; color: white; padding: 20px; display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
    .header h1 { font-size: 18px; margin: 0; }
    .header .sub { font-size: 11px; opacity: 0.6; margin-top: 4px; }
    .cross { width: 40px; height: 40px; background: #C0392B; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 24px; color: white; font-weight: bold; }
    .section { margin-bottom: 20px; }
    .section-title { font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.08em; color: #6B6864; border-bottom: 1px solid #EDECEA; padding-bottom: 4px; margin-bottom: 10px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .field label { font-size: 10px; color: #6B6864; display: block; margin-bottom: 2px; }
    .field p { font-size: 12px; font-weight: 500; margin: 0; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #F7F6F4; padding: 8px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #6B6864; }
    td { padding: 8px; border-bottom: 1px solid #EDECEA; font-size: 12px; }
    .badge { background: #EDECEA; border-radius: 4px; padding: 3px 8px; font-size: 11px; display: inline-block; margin-right: 4px; }
    .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 30px; }
    .sig-box { border: 1px solid #EDECEA; border-radius: 6px; padding: 14px; }
    .sig-role { font-size: 10px; font-weight: bold; text-transform: uppercase; color: #6B6864; margin-bottom: 8px; }
    .sig-line { height: 50px; border-bottom: 1px solid #C8C6C2; margin-bottom: 6px; }
    .sig-name { font-size: 11px; color: #6B6864; }
    .num { font-family: monospace; font-size: 11px; color: #C0392B; font-weight: bold; }
  </style></head><body>
  <div class="header">
    <div>
      <div style="font-size:11px;opacity:0.5;margin-bottom:4px;">SECOURISTES DU SUD · NÎMES · Agrément sécurité civile</div>
      <h1>Ordre de mission</h1>
      <div class="sub">${om.numero} · ${om.signe ? 'Document signé' : 'En attente de signatures'}</div>
    </div>
    <div class="cross">+</div>
  </div>

  <div class="section">
    <div class="section-title">Informations événement</div>
    <div class="grid">
      <div class="field"><label>Événement</label><p>${evt.nom}</p></div>
      <div class="field"><label>Type</label><p>${evt.type}</p></div>
      <div class="field"><label>Date</label><p>${dateEvt}</p></div>
      <div class="field"><label>Horaires</label><p>${evt.heure_debut} – ${evt.heure_fin}</p></div>
      <div class="field"><label>Lieu</label><p>${evt.lieu || '—'}</p></div>
      <div class="field"><label>Contact organisateur</label><p>${evt.contact_organisateur || '—'}</p></div>
    </div>
  </div>

  ${evt.instructions_acces ? `<div class="section"><div class="section-title">Instructions d'accès</div><p>${evt.instructions_acces}</p></div>` : ''}
  ${evt.protocoles ? `<div class="section"><div class="section-title">Consignes médicales / Protocoles</div><p>${evt.protocoles}</p></div>` : ''}

  <div class="section">
    <div class="section-title">Véhicules affectés</div>
    ${vehiculesHtml}
  </div>

  <div class="section">
    <div class="section-title">Personnel affecté</div>
    <table>
      <thead><tr><th>Nom</th><th>Poste</th><th>Qualifications</th></tr></thead>
      <tbody>${personnelRows}</tbody>
    </table>
  </div>

  <div class="sig-grid">
    <div class="sig-box">
      <div class="sig-role">Responsable association</div>
      <div class="sig-line"></div>
      <div class="sig-name">Jean Dupont · Président<br>${om.sig_responsable ? '✓ Validé' : 'Signature requise'}</div>
    </div>
    <div class="sig-box">
      <div class="sig-role">Chef de poste</div>
      <div class="sig-line"></div>
      <div class="sig-name">${om.sig_chef ? '✓ Validé' : 'Signature requise'}</div>
    </div>
  </div>
  </body></html>`;
}

// Toutes les autres routes → app frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Secouristes du Sud — serveur démarré sur le port ${PORT}`);
});
