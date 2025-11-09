import React, { useEffect, useState } from 'react';
import { authClient } from '../lib/auth-client';

interface Organization {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  metadata: any;
  createdAt: string;
}

interface Member {
  id: string;
  userId: string;
  role: 'owner' | 'admin' | 'member';
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
  createdAt: string;
}

interface Invitation {
  id: string;
  email: string;
  role: 'owner' | 'admin' | 'member';
  status: 'pending' | 'accepted' | 'rejected' | 'canceled';
  expiresAt: string;
  organizationId: string;
}

export default function OrganizationManager() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'create' | 'details'>('list');

  // Create org form
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgSlug, setNewOrgSlug] = useState('');

  // Invite form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');

  const loadOrganizations = async () => {
    setLoading(true);
    setError(null);
    try {
      const res: any = await authClient.organization.list();
      if (res?.error) {
        const errorMsg = res.error.message || 'Failed to load organizations';
        // Check if it's an authentication error
        if (errorMsg.includes('Unauthorized') || errorMsg.includes('401')) {
          setError('Please sign in again to manage organizations');
        } else {
          setError(errorMsg);
        }
      } else {
        setOrganizations(res?.data || []);
        // Set first org as active if none selected
        if (!activeOrgId && res?.data?.length > 0) {
          setActiveOrgId(res.data[0].id);
        }
      }
    } catch (e: any) {
      console.error('Organization load error:', e);
      if (e?.message?.includes('NetworkError') || e?.message?.includes('fetch')) {
        setError('Network error. Please check your connection and try again.');
      } else {
        setError(e?.message || 'Failed to load organizations');
      }
    } finally {
      setLoading(false);
    }
  };

  const loadMembers = async (orgId: string) => {
    try {
      const res: any = await authClient.organization.listMembers({
        organizationId: orgId,
      });
      if (res?.error) {
        console.error('Failed to load members:', res.error);
      } else {
        setMembers(res?.data || []);
      }
    } catch (e) {
      console.error('Failed to load members:', e);
    }
  };

  const loadInvitations = async (orgId: string) => {
    try {
      const res: any = await authClient.organization.listInvitations({
        organizationId: orgId,
      });
      if (res?.error) {
        console.error('Failed to load invitations:', res.error);
      } else {
        setInvitations(res?.data || []);
      }
    } catch (e) {
      console.error('Failed to load invitations:', e);
    }
  };

  useEffect(() => {
    loadOrganizations();
  }, []);

  useEffect(() => {
    if (activeOrgId) {
      loadMembers(activeOrgId);
      loadInvitations(activeOrgId);
    }
  }, [activeOrgId]);

  const createOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim() || !newOrgSlug.trim()) {
      setError('Name and slug are required');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res: any = await authClient.organization.create({
        name: newOrgName.trim(),
        slug: newOrgSlug.trim(),
      });
      if (res?.error) {
        const errorMsg = res.error.message || 'Failed to create organization';
        console.error('Create org error:', res.error);
        setError(errorMsg);
      } else {
        setNewOrgName('');
        setNewOrgSlug('');
        setView('list');
        await loadOrganizations();
      }
    } catch (e: any) {
      console.error('Create org exception:', e);
      if (e?.message?.includes('NetworkError') || e?.message?.includes('fetch')) {
        setError('Network error. Please check your connection and try again.');
      } else {
        setError(e?.message || 'Failed to create organization');
      }
    } finally {
      setLoading(false);
    }
  };

  const sendInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !activeOrgId) return;

    setLoading(true);
    setError(null);
    try {
      const res: any = await authClient.organization.inviteMember({
        organizationId: activeOrgId,
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      if (res?.error) {
        setError(res.error.message || 'Failed to send invitation');
      } else {
        setInviteEmail('');
        await loadInvitations(activeOrgId);
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to send invitation');
    } finally {
      setLoading(false);
    }
  };

  const removeMember = async (memberId: string) => {
    if (!activeOrgId || !confirm('Remove this member?')) return;

    setLoading(true);
    try {
      const res: any = await authClient.organization.removeMember({
        organizationId: activeOrgId,
        memberId,
      });
      if (!res?.error) {
        await loadMembers(activeOrgId);
      }
    } catch (e) {
      console.error('Failed to remove member:', e);
    } finally {
      setLoading(false);
    }
  };

  const cancelInvitation = async (invitationId: string) => {
    if (!activeOrgId || !confirm('Cancel this invitation?')) return;

    setLoading(true);
    try {
      const res: any = await authClient.organization.cancelInvitation({
        invitationId,
      });
      if (!res?.error) {
        await loadInvitations(activeOrgId);
      }
    } catch (e) {
      console.error('Failed to cancel invitation:', e);
    } finally {
      setLoading(false);
    }
  };

  const setActiveOrganization = async (orgId: string) => {
    try {
      const res: any = await authClient.organization.setActive({
        organizationId: orgId,
      });
      if (!res?.error) {
        setActiveOrgId(orgId);
      }
    } catch (e) {
      console.error('Failed to set active organization:', e);
    }
  };

  const activeOrg = organizations.find(o => o.id === activeOrgId);

  if (view === 'create') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">Create Organization</h2>
          <button
            onClick={() => setView('list')}
            className="text-sm text-gray-400 hover:text-white"
          >
            Cancel
          </button>
        </div>

        <form onSubmit={createOrganization} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Organization Name
            </label>
            <input
              type="text"
              value={newOrgName}
              onChange={(e) => {
                setNewOrgName(e.target.value);
                // Auto-generate slug
                setNewOrgSlug(e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''));
              }}
              className="w-full px-3 py-2 rounded-lg bg-gray-700/50 border border-gray-600 text-white"
              placeholder="Acme Corp"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Slug (URL identifier)
            </label>
            <input
              type="text"
              value={newOrgSlug}
              onChange={(e) => setNewOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              className="w-full px-3 py-2 rounded-lg bg-gray-700/50 border border-gray-600 text-white font-mono text-sm"
              placeholder="acme-corp"
              required
            />
            <p className="text-xs text-gray-400 mt-1">Only lowercase letters, numbers, and hyphens</p>
          </div>

          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded p-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Organization'}
          </button>
        </form>
      </div>
    );
  }

  if (view === 'list') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">Your Organizations</h2>
          <button
            onClick={() => setView('create')}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
          >
            + New Organization
          </button>
        </div>

        {error && (
          <div className="text-sm text-red-400">{error}</div>
        )}

        {loading && organizations.length === 0 ? (
          <div className="text-gray-400 text-sm">Loading...</div>
        ) : organizations.length === 0 ? (
          <div className="text-center py-12 text-gray-400 border border-gray-700 rounded-lg">
            <div className="text-6xl mb-3">🏢</div>
            <p className="text-sm font-medium mb-1">No Organizations</p>
            <p className="text-xs text-gray-500">Create your first organization to get started</p>
          </div>
        ) : (
          <div className="space-y-2">
            {organizations.map((org) => (
              <div
                key={org.id}
                className={`p-4 rounded-lg border ${
                  activeOrgId === org.id
                    ? 'bg-blue-500/10 border-blue-500/50'
                    : 'bg-gray-700/40 border-gray-600/50 hover:bg-gray-700/60'
                } transition-all cursor-pointer`}
                onClick={() => {
                  setActiveOrgId(org.id);
                  setView('details');
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {org.logo ? (
                      <img src={org.logo} alt={org.name} className="w-10 h-10 rounded" />
                    ) : (
                      <div className="w-10 h-10 rounded bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold">
                        {org.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <h3 className="font-semibold text-white">{org.name}</h3>
                      <p className="text-xs text-gray-400">/{org.slug}</p>
                    </div>
                  </div>
                  {activeOrgId === org.id && (
                    <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded border border-blue-500/30">
                      Active
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Details view
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => setView('list')}
            className="text-sm text-blue-400 hover:text-blue-300 mb-2 flex items-center gap-1"
          >
            ← Back to Organizations
          </button>
          <h2 className="text-xl font-semibold text-white">{activeOrg?.name}</h2>
          <p className="text-sm text-gray-400">/{activeOrg?.slug}</p>
        </div>
      </div>

      {/* Members Section */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-white">Members</h3>
        <div className="space-y-2">
          {members.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between bg-gray-700/40 rounded-lg px-3 py-2"
            >
              <div className="flex items-center gap-3">
                {member.user.image ? (
                  <img src={member.user.image} alt={member.user.name || ''} className="w-8 h-8 rounded-full" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-white text-sm">
                    {(member.user.name || member.user.email).charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="text-sm text-white font-medium">
                    {member.user.name || member.user.email}
                  </div>
                  <div className="text-xs text-gray-400">{member.user.email}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 bg-gray-600 text-gray-200 text-xs rounded capitalize">
                  {member.role}
                </span>
                {member.role !== 'owner' && (
                  <button
                    onClick={() => removeMember(member.id)}
                    className="px-2 py-1 rounded bg-red-600 hover:bg-red-700 text-white text-xs"
                    disabled={loading}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Invite Section */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-white">Invite Member</h3>
        <form onSubmit={sendInvitation} className="flex gap-2">
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg bg-gray-700/50 border border-gray-600 text-white text-sm"
            placeholder="email@example.com"
            required
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as 'admin' | 'member')}
            className="px-3 py-2 rounded-lg bg-gray-700/50 border border-gray-600 text-white text-sm"
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
          >
            Invite
          </button>
        </form>
      </div>

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-white">Pending Invitations</h3>
          <div className="space-y-2">
            {invitations.filter(inv => inv.status === 'pending').map((invitation) => (
              <div
                key={invitation.id}
                className="flex items-center justify-between bg-gray-700/40 rounded-lg px-3 py-2"
              >
                <div>
                  <div className="text-sm text-white">{invitation.email}</div>
                  <div className="text-xs text-gray-400 capitalize">
                    {invitation.role} • Expires {new Date(invitation.expiresAt).toLocaleDateString()}
                  </div>
                </div>
                <button
                  onClick={() => cancelInvitation(invitation.id)}
                  className="px-2 py-1 rounded bg-gray-600 hover:bg-gray-500 text-white text-xs"
                  disabled={loading}
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded p-2">
          {error}
        </div>
      )}
    </div>
  );
}
