'use client';

/**
 * Vue admin — comptes utilisateurs (M8-T02)
 * Lecture seule : état des inscriptions (email vérifié, pass, volumétrie CV).
 * Garde côté client (redirect si non-admin) ; le serveur reste l'autorité (403).
 */

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BadgeCheck, CircleSlash, Users } from 'lucide-react';
import Navbar from '@/components/Navbar';
import Button from '@/components/ui/Button';
import { listAdminUsers } from '@/lib/api';
import { getMe, type User } from '@/lib/auth';

const PAGE_SIZE = 50;

export default function AdminUsersPage() {
  const router = useRouter();
  const [me, setMe] = useState<User | null>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    getMe()
      .then((user) => {
        if (user.role !== 'admin') {
          router.replace('/cvs');
        } else {
          setMe(user);
        }
      })
      .catch(() => router.replace('/login'));
  }, [router]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin-users', offset],
    queryFn: () => listAdminUsers(PAGE_SIZE, offset),
    enabled: me !== null,
  });

  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso));

  if (me === null) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
        <Navbar variant="authenticated" />
        <div className="flex items-center justify-center py-32">
          <div className="w-12 h-12 border-4 border-action border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      <Navbar variant="authenticated" />

      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="mb-8 flex items-center gap-3">
          <div className="w-12 h-12 bg-action/10 rounded-lg flex items-center justify-center">
            <Users size={24} className="text-action" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-text-primary">Utilisateurs</h1>
            {data && (
              <p className="text-sm text-text-secondary">
                {data.total} compte{data.total > 1 ? 's' : ''} au total
              </p>
            )}
          </div>
        </div>

        {isLoading && (
          <div className="flex justify-center py-20">
            <div className="w-12 h-12 border-4 border-action border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {isError && (
          <p className="text-red-600 py-8">
            {error instanceof Error ? error.message : 'Erreur de chargement'}
          </p>
        )}

        {data && (
          <>
            <div className="overflow-x-auto rounded-xl border-2 border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-text-secondary">
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">Nom</th>
                    <th className="px-4 py-3 font-medium">Vérifié</th>
                    <th className="px-4 py-3 font-medium">Pass</th>
                    <th className="px-4 py-3 font-medium">CV</th>
                    <th className="px-4 py-3 font-medium">Inscrit le</th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((u) => (
                    <tr
                      key={u.id}
                      className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
                    >
                      <td className="px-4 py-3 font-medium text-text-primary">
                        {u.email}
                        {u.role === 'admin' && (
                          <span className="ml-2 rounded bg-action/10 px-1.5 py-0.5 text-xs font-semibold text-action">
                            admin
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {u.full_name ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        {u.email_verified ? (
                          <BadgeCheck size={18} className="text-green-600" />
                        ) : (
                          <CircleSlash size={18} className="text-gray-400" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {u.has_active_pass && u.pass_valid_until
                          ? `actif → ${formatDate(u.pass_valid_until)}`
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{u.cv_count}</td>
                      <td className="px-4 py-3 text-text-secondary">
                        {formatDate(u.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data.total > PAGE_SIZE && (
              <div className="mt-6 flex items-center justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                >
                  ← Précédents
                </Button>
                <span className="text-sm text-text-secondary">
                  {offset + 1}–{Math.min(offset + PAGE_SIZE, data.total)} sur{' '}
                  {data.total}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset + PAGE_SIZE >= data.total}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                >
                  Suivants →
                </Button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
