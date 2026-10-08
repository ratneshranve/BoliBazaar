import { useCallback, useEffect, useState } from 'react';
import { UserCog, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { call, http, errorMessage } from '@core/api';
import { useAuth } from '@core/AuthContext';
import { Badge, Button, DataTable, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner } from '@components/ui';

/* ───────── Staff accounts ───────── */

function StaffForm({ staff, roles, onClose, onSaved }) {
  const isNew = !staff;
  const [f, setF] = useState({
    name: staff?.name || '',
    email: staff?.email || '',
    phone: staff?.phone || '',
    roleId: staff?.role?.id || roles[0]?.id || '',
    status: staff?.status || 'active',
    password: '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    setBusy(true);
    try {
      const body = { name: f.name, email: f.email, phone: f.phone || undefined, roleId: f.roleId };
      if (isNew) await call(http.post('/staff/admins', { ...body, password: f.password }));
      else await call(http.put(`/staff/admins/${staff.id}`, { ...body, status: f.status }));
      toast.success('Saved');
      onSaved();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={isNew ? 'Add staff member' : 'Edit staff member'}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button loading={busy} onClick={save} disabled={!f.name || !f.email || !f.roleId || (isNew && f.password.length < 10)}>Save</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name"><Input value={f.name} onChange={set('name')} /></Field>
        <Field label="Email"><Input type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Phone"><Input value={f.phone} onChange={set('phone')} /></Field>
        <Field label="Role">
          <Select value={f.roleId} onChange={set('roleId')}>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </Field>
        {isNew ? (
          <Field label="Temporary password" hint="At least 10 characters"><Input type="password" value={f.password} onChange={set('password')} autoComplete="new-password" /></Field>
        ) : (
          <Field label="Status">
            <Select value={f.status} onChange={set('status')}>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </Select>
          </Field>
        )}
      </div>
    </Modal>
  );
}

/* ───────── Roles ───────── */

function RoleForm({ role, catalogue, onClose, onSaved }) {
  const [name, setName] = useState(role?.name || '');
  const [description, setDescription] = useState(role?.description || '');
  const [perms, setPerms] = useState(new Set(role?.permissions || []));
  const [busy, setBusy] = useState(false);

  const toggle = (p) => setPerms((s) => {
    const n = new Set(s);
    if (n.has(p)) n.delete(p); else n.add(p);
    return n;
  });
  const toggleModule = (mod, actions) => setPerms((s) => {
    const n = new Set(s);
    const all = actions.every((a) => n.has(`${mod}.${a}`));
    actions.forEach((a) => (all ? n.delete(`${mod}.${a}`) : n.add(`${mod}.${a}`)));
    return n;
  });

  const save = async () => {
    setBusy(true);
    try {
      const body = { name, description: description || undefined, permissions: [...perms] };
      if (role) await call(http.put(`/staff/roles/${role.id}`, body));
      else await call(http.post('/staff/roles', body));
      toast.success('Role saved');
      onSaved();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      wide
      title={role ? `Edit role: ${role.name}` : 'New role'}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button loading={busy} onClick={save} disabled={name.trim().length < 2}>Save role</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Role name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Description"><Input value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        </div>
        <div className="space-y-2">
          <div className="text-sm font-medium">Permissions</div>
          {Object.entries(catalogue).map(([mod, actions]) => (
            <div key={mod} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-neutral-200 px-3 py-2">
              <label className="flex w-36 items-center gap-2 text-sm font-semibold capitalize">
                <input type="checkbox" checked={actions.every((a) => perms.has(`${mod}.${a}`))} onChange={() => toggleModule(mod, actions)} />
                {mod}
              </label>
              {actions.map((a) => (
                <label key={a} className="flex items-center gap-1.5 text-sm text-neutral-700">
                  <input type="checkbox" checked={perms.has(`${mod}.${a}`)} onChange={() => toggle(`${mod}.${a}`)} />
                  {a.replace('_', ' ')}
                </label>
              ))}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function StaffPage() {
  const { can } = useAuth();
  const edit = can('staff.edit');
  const [tab, setTab] = useState('staff');
  const [admins, setAdmins] = useState(null);
  const [roles, setRoles] = useState(null);
  const [catalogue, setCatalogue] = useState({});
  const [error, setError] = useState('');
  const [staffForm, setStaffForm] = useState(null);
  const [roleForm, setRoleForm] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const [a, r, p] = await Promise.all([
        call(http.get('/staff/admins', { params: { limit: 100 } })),
        call(http.get('/staff/roles')),
        call(http.get('/staff/permissions')),
      ]);
      setAdmins(a.data);
      setRoles(r.data);
      setCatalogue(p.data);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const resetPassword = async (s) => {
    const password = window.prompt(`New temporary password for ${s.name} (min 10 characters)`);
    if (!password) return;
    try {
      await call(http.post(`/staff/admins/${s.id}/reset-password`, { password }));
      toast.success('Password reset; they were logged out everywhere');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const deleteRole = async (r) => {
    if (!window.confirm(`Delete role "${r.name}"?`)) return;
    try {
      await call(http.delete(`/staff/roles/${r.id}`));
      load();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!admins || !roles) return <Spinner />;

  return (
    <>
      <PageHeader
        title="Staff & Roles"
        subtitle="Control who can access which part of the admin panel"
        actions={
          edit && (
            <Button variant="brand" onClick={() => (tab === 'staff' ? setStaffForm({}) : setRoleForm({}))}>
              {tab === 'staff' ? 'Add staff' : 'New role'}
            </Button>
          )
        }
      />
      <div className="mb-4 flex gap-2">
        {['staff', 'roles'].map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-4 py-2 text-sm font-semibold capitalize ${tab === t ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-700 hover:bg-neutral-50'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'staff' ? (
        <DataTable
          rows={admins}
          columns={[
            { key: 'name', header: 'Name', render: (r) => <span className="font-medium">{r.name}</span> },
            { key: 'email', header: 'Email' },
            { key: 'role', header: 'Role', render: (r) => r.role?.name || '—' },
            { key: 'status', header: 'Status', render: (r) => <Badge tone={r.status === 'active' ? 'green' : 'red'}>{r.status}</Badge> },
            { key: 'lastLoginAt', header: 'Last login', render: (r) => (r.lastLoginAt ? new Date(r.lastLoginAt).toLocaleString() : 'Never') },
            {
              key: 'actions',
              header: '',
              render: (r) =>
                edit && (
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setStaffForm(r)}>Edit</Button>
                    <Button variant="outline" onClick={() => resetPassword(r)} title="Reset password"><KeyRound className="h-4 w-4" /></Button>
                  </div>
                ),
            },
          ]}
        />
      ) : (
        <DataTable
          rows={roles}
          columns={[
            { key: 'name', header: 'Role', render: (r) => <span className="font-medium">{r.name}{r.isSuper && <Badge tone="blue">Super</Badge>}</span> },
            { key: 'description', header: 'Description', render: (r) => r.description || '—' },
            { key: 'perm', header: 'Permissions', render: (r) => (r.isSuper ? 'All' : r.permissions.length) },
            { key: 'staffCount', header: 'Staff' },
            {
              key: 'actions',
              header: '',
              render: (r) =>
                edit &&
                !r.isSuper && (
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setRoleForm(r)}>Edit</Button>
                    {!r.isSystem && <Button variant="outline" onClick={() => deleteRole(r)}>Delete</Button>}
                  </div>
                ),
            },
          ]}
        />
      )}

      {staffForm && <StaffForm staff={staffForm.id ? staffForm : null} roles={roles} onClose={() => setStaffForm(null)} onSaved={() => { setStaffForm(null); load(); }} />}
      {roleForm && <RoleForm role={roleForm.id ? roleForm : null} catalogue={catalogue} onClose={() => setRoleForm(null)} onSaved={() => { setRoleForm(null); load(); }} />}
    </>
  );
}

export default {
  key: 'staff',
  section: 'System',
  nav: [{ label: 'Staff & Roles', path: '/staff', icon: UserCog, permission: 'staff.view' }],
  routes: [{ path: '/staff', element: <StaffPage />, permission: 'staff.view' }],
};
