import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  Archive, ArrowDownToLine, ArrowUpFromLine, Bell, Check, ChevronDown, Cloud, Copy, File,
  FileImage, FileSpreadsheet, FileText, FolderOpen, HardDrive, Home, Link2, LoaderCircle,
  LogOut, Menu, MoreHorizontal, Search, Settings, Share2, ShieldCheck, Trash2, UploadCloud,
  Users, X, LockKeyhole, Mail, Eye, Clock3, CheckCircle2, AlertCircle,
} from 'lucide-react';


import {
  fileKind,
  formatBytes,
  isSupabaseConfigured,
  supabase,
  type FileShare,
  type StoredFile,
} from './lib';

type Notice = { type: 'success' | 'error' | 'info'; text: string };
type Tab = 'My files' | 'Shared with me' | 'Recent';
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const BUCKET = 'secure-files';

function IconForFile({ name }: { name: string }) {
  const kind = fileKind(name);
  const common = { size: 19, strokeWidth: 1.8 };
  if (kind === 'image') return <FileImage {...common} />;
  if (kind === 'sheet') return <FileSpreadsheet {...common} />;
  if (kind === 'doc' || kind === 'pdf') return <FileText {...common} />;
  if (kind === 'archive') return <Archive {...common} />;
  return <File {...common} />;
}
function shortDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function initials(email?: string) { return email?.slice(0, 1).toUpperCase() || 'U'; }

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [shares, setShares] = useState<FileShare[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('My files');
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [shareFile, setShareFile] = useState<StoredFile | null>(null);
  const [shareEmail, setShareEmail] = useState('');
  const [shareExpiry, setShareExpiry] = useState('60');
  const [sharePermission, setSharePermission] = useState<'view' | 'download'>('download');
  const [shareLink, setShareLink] = useState('');
  const [showProfile, setShowProfile] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const notify = useCallback((text: string, type: Notice['type'] = 'success') => {
    setNotice({ text, type });
    window.setTimeout(() => setNotice(null), 4200);
  }, []);

  useEffect(() => {
    if (!supabase) { setAuthLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthLoading(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthLoading(false);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const loadData = useCallback(async () => {
    if (!supabase || !session?.user) return;
    const [fileResult, shareResult] = await Promise.all([
      supabase.from('files').select('*').order('created_at', { ascending: false }),
      supabase.from('file_shares').select('*').order('created_at', { ascending: false }),
    ]);
    if (fileResult.error) notify(`Could not load files: ${fileResult.error.message}`, 'error');
    else setFiles((fileResult.data ?? []) as StoredFile[]);
    if (shareResult.error) notify(`Could not load shares: ${shareResult.error.message}`, 'error');
    else setShares((shareResult.data ?? []) as FileShare[]);
  }, [session, notify]);

  useEffect(() => { void loadData(); }, [loadData]);

  const myShares = useMemo(() => shares.filter(s => s.owner_id === session?.user?.id), [shares, session]);
  const receivedShares = useMemo(() => shares.filter(s => s.owner_id !== session?.user?.id), [shares, session]);
  const visibleFiles = useMemo(() => {
    const list = activeTab === 'Recent' ? files.slice(0, 8) : files;
    return list.filter(f => f.file_name.toLowerCase().includes(search.toLowerCase()));
  }, [files, activeTab, search]);
  const totalBytes = files.reduce((sum, file) => sum + file.file_size, 0);
  const userEmail = session?.user?.email ?? '';

  async function authenticate(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    const result = authMode === 'signin'
      ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
      : await supabase.auth.signUp({ email: email.trim(), password });
    setBusy(false);
    if (result.error) notify(result.error.message, 'error');
    else if (authMode === 'signup' && !result.data.session) notify('Account created. Check your email to confirm it, then sign in.', 'info');
    else notify(authMode === 'signin' ? 'Welcome back!' : 'Account created successfully.');
  }

  async function logout() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setFiles([]); setShares([]); setShowProfile(false);
    notify('You have been signed out.', 'info');
  }

  async function uploadFiles(selected: FileList | null) {
    if (!supabase || !session?.user || !selected?.length) return;
    setUploading(true);
    let successCount = 0;
    for (const file of Array.from(selected)) {
      if (file.size > MAX_FILE_BYTES) { notify(`${file.name} exceeds the 10 MB limit.`, 'error'); continue; }
      const allowed = /\.(pdf|doc|docx|txt|rtf|jpg|jpeg|png|gif|webp|csv|xls|xlsx|zip)$/i.test(file.name);
      if (!allowed) { notify(`${file.name}: unsupported file type.`, 'error'); continue; }
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${session.user.id}/${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type || 'application/octet-stream', upsert: false,
      });
      if (uploadError) { notify(`Upload failed: ${uploadError.message}`, 'error'); continue; }
      const { error: rowError } = await supabase.from('files').insert({
        owner_id: session.user.id, file_name: file.name, storage_path: path,
        file_size: file.size, mime_type: file.type || 'application/octet-stream',
      });
      if (rowError) {
        await supabase.storage.from(BUCKET).remove([path]);
        notify(`File metadata failed: ${rowError.message}`, 'error');
      } else successCount++;
    }
    setUploading(false);
    if (successCount) { notify(`${successCount} file${successCount === 1 ? '' : 's'} uploaded securely.`); setActiveTab('My files'); await loadData(); }
    if (inputRef.current) inputRef.current.value = '';
  }

  async function downloadFile(path: string, name: string, forceDownload = true) {
    if (!supabase) return;
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60, { download: forceDownload ? name : undefined });
    if (error || !data?.signedUrl) { notify(`Unable to access file: ${error?.message ?? 'No signed URL returned'}`, 'error'); return; }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  async function deleteFile(file: StoredFile) {
    if (!supabase || !window.confirm(`Permanently delete “${file.file_name}”?`)) return;
    setBusy(true);
    const { error: storageError } = await supabase.storage.from(BUCKET).remove([file.storage_path]);
    if (storageError) { setBusy(false); notify(`Delete failed: ${storageError.message}`, 'error'); return; }
    const { error } = await supabase.from('files').delete().eq('id', file.id);
    setBusy(false);
    if (error) notify(`File row could not be deleted: ${error.message}`, 'error');
    else { notify('File deleted.'); await loadData(); }
  }

  async function createShare(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !shareFile || !session?.user) return;
    const recipient = shareEmail.trim().toLowerCase();
    if (!recipient || recipient === userEmail.toLowerCase()) { notify('Enter another user’s email address.', 'error'); return; }
    setBusy(true); setShareLink('');
    const expiresAt = new Date(Date.now() + Number(shareExpiry) * 60_000).toISOString();
    const { error } = await supabase.from('file_shares').insert({
      owner_id: session.user.id, file_id: shareFile.id, recipient_email: recipient,
      file_name: shareFile.file_name, storage_path: shareFile.storage_path,
      permission: sharePermission, expires_at: expiresAt,
    });
    setBusy(false);
    if (error) { notify(`Could not share file: ${error.message}`, 'error'); return; }
    notify(`Shared with ${recipient}. They must sign in using that email.`);
    await loadData();
    setShareFile(null); setShareEmail('');
  }

  async function revokeShare(share: FileShare) {
    if (!supabase || !window.confirm(`Revoke access for ${share.recipient_email}?`)) return;
    const { error } = await supabase.from('file_shares').update({ revoked: true }).eq('id', share.id);
    if (error) notify(`Could not revoke access: ${error.message}`, 'error');
    else { notify('Share revoked.'); await loadData(); }
  }

  async function openShared(share: FileShare) {
    if (new Date(share.expires_at).getTime() <= Date.now() || share.revoked) {
      notify('This share has expired or was revoked.', 'error'); return;
    }
    await downloadFile(share.storage_path, share.file_name, share.permission === 'download');
  }

  const copyLink = async () => {
    if (!shareLink) return;
    await navigator.clipboard.writeText(shareLink);
    notify('Link copied. Anyone with this link can access it until it expires.', 'info');
  };

  if (authLoading) return <div className="loading-screen"><div className="brand-mark"><Cloud size={25}/></div><LoaderCircle className="spin" size={22}/><span>Preparing your secure workspace…</span></div>;

  if (!isSupabaseConfigured) return <SetupScreen />;

  if (!session) return <AuthScreen mode={authMode} setMode={setAuthMode} email={email} setEmail={setEmail} password={password} setPassword={setPassword} busy={busy} onSubmit={authenticate} notice={notice} />;

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
      <div className="brand"><div className="brand-mark"><Cloud size={23}/></div><span>vaultspace</span><button className="icon-btn mobile-close" onClick={() => setMobileNav(false)} aria-label="Close menu"><X size={18}/></button></div>
      <button className="upload-main" onClick={() => inputRef.current?.click()} disabled={uploading}><UploadCloud size={18}/>{uploading ? 'Uploading…' : 'Upload files'}</button>
      <input ref={inputRef} type="file" multiple hidden accept=".pdf,.doc,.docx,.txt,.rtf,.jpg,.jpeg,.png,.gif,.webp,.csv,.xls,.xlsx,.zip" onChange={e => void uploadFiles(e.target.files)} />
      <div className="nav-label">WORKSPACE</div>
      <nav className="side-nav">
        <button className={activeTab === 'My files' ? 'nav-item active' : 'nav-item'} onClick={() => { setActiveTab('My files'); setMobileNav(false); }}><Home size={18}/><span>My files</span><span className="nav-count">{files.length}</span></button>
        <button className={activeTab === 'Recent' ? 'nav-item active' : 'nav-item'} onClick={() => { setActiveTab('Recent'); setMobileNav(false); }}><Clock3 size={18}/><span>Recent</span></button>
        <button className={activeTab === 'Shared with me' ? 'nav-item active' : 'nav-item'} onClick={() => { setActiveTab('Shared with me'); setMobileNav(false); }}><Users size={18}/><span>Shared with me</span><span className="nav-count">{receivedShares.filter(s => !s.revoked && new Date(s.expires_at) > new Date()).length}</span></button>
      </nav>
      <div className="sidebar-bottom"><div className="secure-note"><div className="secure-icon"><ShieldCheck size={18}/></div><div><strong>Your files are private</strong><span>Protected by access policies</span></div></div><button className="nav-item settings-nav" onClick={() => notify('Storage settings are managed through your Supabase project.', 'info')}><Settings size={18}/><span>Settings</span></button></div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="topbar-left"><button className="icon-btn menu-toggle" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu size={20}/></button><div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>{activeTab}</strong></div></div><div className="topbar-right"><div className="global-search"><Search size={17}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search your files" aria-label="Search your files"/><kbd>⌘ K</kbd></div><button className="icon-btn notification-btn" aria-label="Notifications" onClick={() => notify('You’re all caught up.', 'info')}><Bell size={19}/><i/></button><div className="profile-wrap"><button className="profile-button" onClick={() => setShowProfile(!showProfile)}><span className="avatar">{initials(userEmail)}</span><span className="profile-email">{userEmail}</span><ChevronDown size={15}/></button>{showProfile && <div className="profile-menu"><div className="profile-menu-email">{userEmail}</div><button onClick={() => void logout()}><LogOut size={16}/> Sign out</button></div>}</div></div></header>

      <div className="page-content">
        <div className="welcome-row"><div><div className="eyebrow"><span className="status-dot"/> YOUR PERSONAL CLOUD</div><h1>{activeTab === 'Shared with me' ? 'Shared with me' : activeTab === 'Recent' ? 'Recent files' : 'Your files, in one place.'}</h1><p>{activeTab === 'Shared with me' ? 'Files shared with your account, with access you can trust.' : activeTab === 'Recent' ? 'Pick up where you left off.' : 'A secure home for everything that matters.'}</p></div>{activeTab !== 'Shared with me' && <button className="primary-button" onClick={() => inputRef.current?.click()} disabled={uploading}><ArrowUpFromLine size={17}/>{uploading ? 'Uploading…' : 'Upload files'}</button>}</div>

        {activeTab !== 'Shared with me' ? <>
          <section className="stats-grid">
            <div className="stat-card"><div className="stat-icon purple"><FolderOpen size={19}/></div><div className="stat-label">Total files</div><div className="stat-number">{files.length}</div><div className="stat-foot">Files in your workspace</div></div>
            <div className="stat-card"><div className="stat-icon blue"><HardDrive size={19}/></div><div className="stat-label">Storage used</div><div className="stat-number">{formatBytes(totalBytes)}</div><div className="stat-foot">10 MB maximum per file</div><div className="storage-track"><span style={{ width: `${Math.min(totalBytes / (100 * 1024 * 1024) * 100, 100)}%` }}/></div></div>
            <div className="stat-card"><div className="stat-icon green"><Share2 size={19}/></div><div className="stat-label">Active shares</div><div className="stat-number">{myShares.filter(s => !s.revoked && new Date(s.expires_at) > new Date()).length}</div><div className="stat-foot">Links with valid access</div></div>
          </section>
          <section className="files-section"><div className="section-heading"><div><h2>{activeTab === 'Recent' ? 'Recently added' : 'All files'}</h2><p>{visibleFiles.length} {visibleFiles.length === 1 ? 'file' : 'files'} · Private to you unless shared</p></div><div className="table-actions"><button className="filter-button" onClick={() => setSearch('')}><span>{search ? 'Clear search' : 'All files'}</span><ChevronDown size={15}/></button></div></div>
            <div className="file-table"><div className="file-table-head"><span>NAME</span><span>FILE SIZE</span><span>DATE ADDED</span><span>SHARING</span><span/></div>
              {visibleFiles.map(file => { const active = myShares.filter(s => s.file_id === file.id && !s.revoked && new Date(s.expires_at) > new Date()).length; return <div className="file-row" key={file.id}><div className="file-name-cell"><div className={`file-icon ${fileKind(file.file_name)}`}><IconForFile name={file.file_name}/></div><div className="file-name-info"><strong title={file.file_name}>{file.file_name}</strong><span>{file.mime_type || 'Unknown type'}</span></div></div><span className="file-size">{formatBytes(file.file_size)}</span><span className="file-date">{shortDate(file.created_at)}</span><span>{active ? <span className="shared-badge"><Users size={13}/>{active} {active === 1 ? 'person' : 'people'}</span> : <span className="private-badge"><LockKeyhole size={12}/>Private</span>}</span><div className="row-actions"><button className="icon-btn" title="Download" onClick={() => void downloadFile(file.storage_path, file.file_name)}><ArrowDownToLine size={17}/></button><button className="icon-btn" title="Share" onClick={() => { setShareFile(file); setShareLink(''); }}><Share2 size={17}/></button><button className="icon-btn danger-hover" title="Delete" disabled={busy} onClick={() => void deleteFile(file)}><Trash2 size={16}/></button></div></div>; })}
              {visibleFiles.length === 0 && <div className="empty-state"><div className="empty-icon"><FolderOpen size={27}/></div><h3>{search ? 'No matching files' : 'Your cloud is ready'}</h3><p>{search ? 'Try a different search term.' : 'Upload your first file to start building your secure workspace.'}</p>{!search && <button className="primary-button" onClick={() => inputRef.current?.click()}><UploadCloud size={16}/>Upload your first file</button>}</div>}
            </div>
          </section>
        </> : <section className="files-section"><div className="section-heading"><div><h2>Shared files</h2><p>Only active shares addressed to your signed-in email are shown.</p></div></div><div className="file-table"><div className="file-table-head shared-head"><span>NAME</span><span>SHARED BY</span><span>EXPIRES</span><span>PERMISSION</span><span/></div>{receivedShares.filter(s => !s.revoked && new Date(s.expires_at) > new Date() && s.recipient_email.toLowerCase() === userEmail.toLowerCase() && s.file_name.toLowerCase().includes(search.toLowerCase())).map(share => <div className="file-row shared-row" key={share.id}><div className="file-name-cell"><div className={`file-icon ${fileKind(share.file_name)}`}><IconForFile name={share.file_name}/></div><div className="file-name-info"><strong>{share.file_name}</strong><span>Shared file</span></div></div><span className="file-date">{share.owner_id.slice(0, 8)}…</span><span className="file-date">{shortDate(share.expires_at)}</span><span className="shared-badge"><Eye size={13}/>{share.permission}</span><div className="row-actions"><button className="icon-btn" title="Open shared file" onClick={() => void openShared(share)}><ArrowDownToLine size={17}/></button></div></div>)}{receivedShares.filter(s => !s.revoked && new Date(s.expires_at) > new Date() && s.recipient_email.toLowerCase() === userEmail.toLowerCase()).length === 0 && <div className="empty-state"><div className="empty-icon"><Users size={27}/></div><h3>Nothing shared with you yet</h3><p>When someone shares a file with {userEmail}, it will appear here.</p></div>}</div></section>}

        <section className="security-banner"><div className="security-banner-icon"><ShieldCheck size={21}/></div><div><strong>Security built into every file</strong><p>Private cloud storage, authenticated access, and database-level permissions keep your files protected.</p></div><span className="security-banner-tag"><CheckCircle2 size={14}/> Protected</span></section>
        <footer className="page-footer"><span>© 2026 Vaultspace</span><span><LockKeyhole size={13}/> Secure cloud storage prototype</span><span>Built with Supabase</span></footer>
      </div>
    </main>

    {shareFile && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setShareFile(null); }}><div className="modal"><div className="modal-top"><div className="modal-icon"><Share2 size={20}/></div><button className="icon-btn" onClick={() => setShareFile(null)} aria-label="Close"><X size={18}/></button></div><h2>Share this file</h2><p className="modal-subtitle">Give a specific account temporary access to your file.</p><div className="sharing-file-preview"><div className={`file-icon ${fileKind(shareFile.file_name)}`}><IconForFile name={shareFile.file_name}/></div><div><strong>{shareFile.file_name}</strong><span>{formatBytes(shareFile.file_size)}</span></div><span className="private-badge"><LockKeyhole size={12}/>Private</span></div><form onSubmit={createShare} className="share-form"><label htmlFor="recipient">Recipient email</label><div className="input-with-icon"><Mail size={17}/><input id="recipient" type="email" required placeholder="teammate@example.com" value={shareEmail} onChange={e => setShareEmail(e.target.value)}/></div><div className="form-two-cols"><div><label htmlFor="permission">Permission</label><select id="permission" value={sharePermission} onChange={e => setSharePermission(e.target.value as 'view' | 'download')}><option value="view">View</option><option value="download">View & download</option></select></div><div><label htmlFor="expiry">Link expires in</label><select id="expiry" value={shareExpiry} onChange={e => setShareExpiry(e.target.value)}><option value="10">10 minutes</option><option value="60">1 hour</option><option value="1440">24 hours</option><option value="10080">7 days</option></select></div></div><div className="share-security-note"><ShieldCheck size={16}/><span>Only the signed-in account matching this email can access the shared file. The share expires automatically.</span></div><button className="primary-button modal-submit" disabled={busy} type="submit">{busy ? <LoaderCircle className="spin" size={17}/> : <Link2 size={17}/>} {busy ? 'Sharing…' : 'Share file securely'}</button></form></div></div>}
    {notice && <div className={`toast toast-${notice.type}`}><span>{notice.type === 'error' ? <AlertCircle size={17}/> : notice.type === 'success' ? <CheckCircle2 size={17}/> : <ShieldCheck size={17}/>}</span>{notice.text}<button onClick={() => setNotice(null)} aria-label="Dismiss"><X size={15}/></button></div>}
  </div>;
}

function SetupScreen() {
  const [copied, setCopied] = useState(false);
  return <div className="setup-screen"><div className="setup-card"><div className="brand setup-brand"><div className="brand-mark"><Cloud size={23}/></div><span>vaultspace</span></div><div className="setup-art"><div className="setup-art-circle"><Cloud size={40}/><ShieldCheck size={21}/></div></div><div className="eyebrow centered">ONE-TIME SETUP</div><h1>Connect your cloud.</h1><p className="setup-copy">The app is ready. Add your Supabase project credentials to connect authentication, storage, and database security.</p><div className="setup-steps"><div><span>1</span><div><strong>Create a Supabase project</strong><p>Open the Supabase dashboard and create a free project.</p></div><a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">Open ↗</a></div><div><span>2</span><div><strong>Add your environment file</strong><p>Copy <code>.env.example</code> to <code>.env.local</code> and fill in your project URL and publishable/anon key.</p></div></div><div><span>3</span><div><strong>Run the database SQL</strong><p>Paste <code>supabase/schema.sql</code> into the Supabase SQL Editor and run it.</p></div></div></div><div className="setup-command"><code>cp .env.example .env.local</code><button onClick={() => { void navigator.clipboard.writeText('cp .env.example .env.local'); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }}><Copy size={15}/>{copied ? 'Copied' : 'Copy'}</button></div><div className="setup-foot"><LockKeyhole size={14}/> Your Supabase secret/service-role key must never be placed in the frontend.</div></div></div>;
}

function AuthScreen({ mode, setMode, email, setEmail, password, setPassword, busy, onSubmit, notice }: any) {
  return <div className="auth-screen"><div className="auth-decoration decor-one"/><div className="auth-decoration decor-two"/><div className="auth-card"><div className="brand auth-brand"><div className="brand-mark"><Cloud size={23}/></div><span>vaultspace</span></div><div className="auth-lock"><LockKeyhole size={24}/></div><div className="eyebrow centered">YOUR FILES. YOUR CONTROL.</div><h1>{mode === 'signin' ? 'Welcome back' : 'Create your account'}</h1><p className="auth-subtitle">{mode === 'signin' ? 'Sign in to your secure cloud workspace.' : 'Start storing and sharing files securely.'}</p><form onSubmit={onSubmit} className="auth-form"><label htmlFor="email">Email address</label><div className="input-with-icon"><Mail size={17}/><input id="email" type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)}/></div><label htmlFor="password">Password</label><div className="input-with-icon"><LockKeyhole size={17}/><input id="password" type="password" required minLength={6} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} placeholder="At least 6 characters" value={password} onChange={e => setPassword(e.target.value)}/></div><button className="primary-button auth-submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17}/> : null}{mode === 'signin' ? 'Sign in securely' : 'Create account'}<span>→</span></button></form><div className="auth-switch">{mode === 'signin' ? 'New to Vaultspace?' : 'Already have an account?'} <button onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>{mode === 'signin' ? 'Create an account' : 'Sign in'}</button></div><div className="auth-trust"><ShieldCheck size={15}/> Protected by Supabase Auth & Row Level Security</div></div>{notice && <div className={`toast toast-${notice.type}`}><span>{notice.type === 'error' ? <AlertCircle size={17}/> : <CheckCircle2 size={17}/>}</span>{notice.text}</div>}</div>;
}
