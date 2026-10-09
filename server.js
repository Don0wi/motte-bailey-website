require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { randomBytes } = require('crypto');
const nodemailer = require('nodemailer');

const app = express();
app.set('trust proxy', 1);
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'motte-bailey.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS staff_users (id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'admin', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS reservations (id INTEGER PRIMARY KEY, reference TEXT UNIQUE NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL, guests INTEGER NOT NULL, notes TEXT, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS event_enquiries (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL, event_type TEXT NOT NULL, guests INTEGER NOT NULL, date TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS contact_messages (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, subject TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS menu_categories (id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS menu_items (id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', category TEXT NOT NULL, price REAL, published INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY, staff_user_id INTEGER, action TEXT NOT NULL, target TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_reservations_date_status ON reservations(date, status);
CREATE INDEX IF NOT EXISTS idx_events_created ON event_enquiries(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_created ON contact_messages(created_at);
`);

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json({ limit: '30kb' }));
app.use(express.urlencoded({ extended: false, limit: '30kb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 180, standardHeaders: 'draft-7', legacyHeaders: false }));
app.use(session({
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: DATA_DIR, concurrentDB: true }),
  name: 'mb.sid', secret: process.env.SESSION_SECRET || 'development-only-change-this-secret',
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 8 * 60 * 60 * 1000 }
}));

const clean = (v, max=1000) => typeof v === 'string' ? v.trim().slice(0,max) : '';
const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s+'T12:00:00Z'));
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: 'draft-7', legacyHeaders: false, message: { message: 'Too many attempts. Please wait and try again.' } });
const auth = (req,res,next) => req.session?.staff ? next() : res.status(401).json({message:'Please sign in to access staff data.'});
function notify(subject, text) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM || !process.env.RESTAURANT_EMAIL) return Promise.resolve(false);
  const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === 'true', auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined });
  return transport.sendMail({ from: process.env.SMTP_FROM, to: process.env.RESTAURANT_EMAIL, subject, text }).then(()=>true).catch(err=>{console.error('Email notification failed:',err.message);return false;});
}
app.get('/api/health', (req,res)=>res.json({status:'ok',database:'connected'}));
app.post('/api/reservations', limiter, async (req,res)=>{
  if (process.env.BOOKING_ENABLED !== 'true' || process.env.BOOKING_RULES_CONFIRMED !== 'true') return res.status(503).json({message:'Online reservations are not enabled yet because the restaurant booking rules have not been configured. Please call +353 90 644 8731 to enquire.'});
  const name=clean(req.body.name,120), email=clean(req.body.email,254), phone=clean(req.body.phone,40), date=clean(req.body.date,10), time=clean(req.body.time,20), guests=Number(req.body.guests), notes=clean(req.body.notes,1000);
  if(name.length<2||!emailOk(email)||(phone.length>0&&phone.length<5)||!isDate(date)||date<new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Dublin'})||!time||!Number.isInteger(guests)||guests<1||guests>10||req.body.privacyConsent!=='on'&&req.body.privacyConsent!==true) return res.status(400).json({message:'Please check all required details and privacy consent.'});
  const ref='MB-'+randomBytes(4).toString('hex').toUpperCase();
  try { const info=db.prepare('INSERT INTO reservations(reference,name,email,phone,date,time,guests,notes) VALUES(?,?,?,?,?,?,?,?)').run(ref,name,email,phone,date,time,guests,notes); await notify(`Reservation enquiry ${ref}`,`Reference: ${ref}\nName: ${name}\nEmail: ${email}\nPhone: ${phone}\nDate: ${date}\nTime: ${time}\nGuests: ${guests}\nNotes: ${notes}`); res.status(201).json({message:`Your reservation request has been received. Reference: ${ref}. The restaurant must confirm availability before the booking is final.`,reference:ref,id:info.lastInsertRowid}); }
  catch(e){console.error(e);res.status(500).json({message:'We could not save your request. Please call the restaurant.'});}
});
app.post('/api/contact', limiter, async (req,res)=>{
  const name=clean(req.body.name,120), email=clean(req.body.email,254), subject=clean(req.body.subject,160), message=clean(req.body.message,3000);
  if(name.length<2||!emailOk(email)||subject.length<2||message.length<3||req.body.privacyConsent!=='on'&&req.body.privacyConsent!==true) return res.status(400).json({message:'Please complete all required fields and accept the privacy notice.'});
  try {const r=db.prepare('INSERT INTO contact_messages(name,email,subject,message) VALUES(?,?,?,?)').run(name,email,subject,message);await notify(`Website contact enquiry: ${subject}`,`From: ${name}\nEmail: ${email}\nSubject: ${subject}\n\n${message}`);res.status(201).json({message:'Thank you. Your enquiry has been received.',id:r.lastInsertRowid});}catch(e){console.error(e);res.status(500).json({message:'Could not save the enquiry. Please call the restaurant.'});}
});
app.post('/api/events', limiter, async (req,res)=>{
  const name=clean(req.body.name,120),email=clean(req.body.email,254),phone=clean(req.body.phone,40),eventType=clean(req.body.eventType,100),date=clean(req.body.date,10),guests=Number(req.body.guests),message=clean(req.body.message,1500);
  if(name.length<2||!emailOk(email)||phone.length<5||!eventType||!isDate(date)||date<new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Dublin'})||!Number.isInteger(guests)||guests<1||guests>100||message.length<3||req.body.privacyConsent!=='on'&&req.body.privacyConsent!==true)return res.status(400).json({message:'Please complete all required fields and check the preferred date.'});
  try{const r=db.prepare('INSERT INTO event_enquiries(name,email,phone,event_type,guests,date,message) VALUES(?,?,?,?,?,?,?)').run(name,email,phone,eventType,guests,date,message);await notify('Website event enquiry',`Name: ${name}\nEmail: ${email}\nPhone: ${phone}\nType: ${eventType}\nGuests: ${guests}\nDate: ${date}\nMessage: ${message}`);res.status(201).json({message:'Thank you. Your event enquiry has been received.',id:r.lastInsertRowid});}catch(e){console.error(e);res.status(500).json({message:'Could not save the enquiry. Please call the restaurant.'});}
});
app.post('/api/admin/login', limiter, (req,res)=>{
  const email=clean(req.body.email,254).toLowerCase(),password=typeof req.body.password==='string'?req.body.password:'';
  const user=db.prepare('SELECT id,email,password_hash,role FROM staff_users WHERE email=?').get(email);
  if(!user||!bcrypt.compareSync(password,user.password_hash))return res.status(401).json({message:'Email or password was not recognised.'});
  req.session.regenerate(err=>{if(err)return res.status(500).json({message:'Could not start a secure session.'});req.session.staff={id:user.id,email:user.email,role:user.role};db.prepare('INSERT INTO audit_logs(staff_user_id,action,target) VALUES(?,?,?)').run(user.id,'login','staff');res.json({message:'Signed in.'});});
});
app.get('/api/admin/me',auth,(req,res)=>res.json({staff:req.session.staff}));
app.post('/api/admin/logout',auth,(req,res)=>req.session.destroy(()=>{res.clearCookie('mb.sid');res.json({message:'Signed out.'});}));
app.get('/api/admin/reservations',auth,(req,res)=>res.json({items:db.prepare('SELECT id,reference,name,email,phone,date,time,guests,notes,status,created_at FROM reservations ORDER BY created_at DESC LIMIT 200').all()}));
app.patch('/api/admin/reservations/:id',auth,(req,res)=>{const status=clean(req.body.status,20);if(!['pending','confirmed','rejected','cancelled'].includes(status))return res.status(400).json({message:'Invalid reservation status.'});const result=db.prepare('UPDATE reservations SET status=? WHERE id=?').run(status,Number(req.params.id));if(!result.changes)return res.status(404).json({message:'Reservation not found.'});db.prepare('INSERT INTO audit_logs(staff_user_id,action,target) VALUES(?,?,?)').run(req.session.staff.id,'reservation_status',`${req.params.id}:${status}`);res.json({message:'Reservation updated.'});});
app.get('/api/admin/events',auth,(req,res)=>res.json({items:db.prepare('SELECT id,name,email,phone,event_type,guests,date,message,created_at FROM event_enquiries ORDER BY created_at DESC LIMIT 200').all()}));
app.get('/api/admin/messages',auth,(req,res)=>res.json({items:db.prepare('SELECT id,name,email,subject,message,created_at FROM contact_messages ORDER BY created_at DESC LIMIT 200').all()}));
app.get('/api/admin/menu',auth,(req,res)=>res.json({items:db.prepare('SELECT id,name,description,category,price,published FROM menu_items ORDER BY category,name').all()}));
app.post('/api/admin/menu',auth,(req,res)=>{const name=clean(req.body.name,120),description=clean(req.body.description,500),category=clean(req.body.category,80),price=req.body.price===''||req.body.price==null?null:Number(req.body.price);if(name.length<2||!category||(price!==null&&(!Number.isFinite(price)||price<0||price>10000)))return res.status(400).json({message:'Provide a valid name, category and price.'});const r=db.prepare('INSERT INTO menu_items(name,description,category,price,published) VALUES(?,?,?,?,0)').run(name,description,category,price);db.prepare('INSERT OR IGNORE INTO menu_categories(name) VALUES(?)').run(category);db.prepare('INSERT INTO audit_logs(staff_user_id,action,target) VALUES(?,?,?)').run(req.session.staff.id,'menu_create',String(r.lastInsertRowid));res.status(201).json({id:r.lastInsertRowid,message:'Menu item created as unpublished.'});});
app.patch('/api/admin/menu/:id',auth,(req,res)=>{const id=Number(req.params.id);const item=db.prepare('SELECT * FROM menu_items WHERE id=?').get(id);if(!item)return res.status(404).json({message:'Menu item not found.'});const published=req.body.published===true||req.body.published===1||req.body.published==='1';const name=req.body.name===undefined?item.name:clean(req.body.name,120);const description=req.body.description===undefined?item.description:clean(req.body.description,500);const category=req.body.category===undefined?item.category:clean(req.body.category,80);const price=req.body.price===undefined?item.price:(req.body.price===''||req.body.price===null?null:Number(req.body.price));if(name.length<2||!category||(price!==null&&(!Number.isFinite(price)||price<0||price>10000)))return res.status(400).json({message:'Provide a valid name, category and price.'});db.prepare('UPDATE menu_items SET name=?,description=?,category=?,price=?,published=? WHERE id=?').run(name,description,category,price,published?1:0,id);db.prepare('INSERT OR IGNORE INTO menu_categories(name) VALUES(?)').run(category);db.prepare('INSERT INTO audit_logs(staff_user_id,action,target) VALUES(?,?,?)').run(req.session.staff.id,'menu_update',String(id));res.json({message:'Menu item updated.'});});
app.delete('/api/admin/menu/:id',auth,(req,res)=>{const r=db.prepare('DELETE FROM menu_items WHERE id=?').run(Number(req.params.id));if(!r.changes)return res.status(404).json({message:'Menu item not found.'});db.prepare('INSERT INTO audit_logs(staff_user_id,action,target) VALUES(?,?,?)').run(req.session.staff.id,'menu_delete',req.params.id);res.json({message:'Menu item deleted.'});});
app.get('/api/menu', (req,res)=>res.json({items:db.prepare('SELECT id,name,description,category,price FROM menu_items WHERE published=1 ORDER BY category,name').all()}));
app.use(express.static(ROOT,{extensions:['html'],index:'index.html',setHeaders(res,file){if(file.endsWith('.html'))res.setHeader('Cache-Control','no-cache');}}));
app.get('/admin', (req,res)=>res.sendFile(path.join(ROOT,'admin','index.html')));
app.get('/admin/login',(req,res)=>res.sendFile(path.join(ROOT,'admin','login','index.html')));
app.use('/api',(req,res)=>res.status(404).json({message:'API endpoint not found.'}));
app.use((req,res)=>res.status(404).sendFile(path.join(ROOT,'404.html')));

function bootstrapAdmin(){
  const email=process.env.ADMIN_EMAIL?.trim().toLowerCase(); const password=process.env.ADMIN_PASSWORD;
  if(email&&password&&password.length>=12&&!db.prepare('SELECT id FROM staff_users WHERE email=?').get(email)){
    db.prepare('INSERT INTO staff_users(email,password_hash,role) VALUES(?,?,?)').run(email,bcrypt.hashSync(password,12),'admin');console.log(`Initial administrator created for ${email}. Remove ADMIN_PASSWORD from the environment after bootstrap and rotate credentials.`);
  }
  if(process.env.NODE_ENV==='production'&&(!process.env.SESSION_SECRET||process.env.SESSION_SECRET.length<32))throw new Error('SESSION_SECRET must be at least 32 characters in production.');
  if(process.env.NODE_ENV==='production'&&process.env.SESSION_SECRET==='development-only-change-this-secret')throw new Error('Replace the development session secret before production.');
}
bootstrapAdmin();
app.listen(PORT,()=>console.log(`Motte & Bailey website running at http://localhost:${PORT}`));
