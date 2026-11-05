import { error } from '@sveltejs/kit';

const sections = ['security', 'sessions', 'passkey', '2fa', 'api-keys', 'organizations'] as const;
export const entries = () => sections.map(section => ({ section }));
export const load = ({ params }: { params: { section: string } }) => {
  const section = sections.find(value => value === params.section);
  if (!section) error(404, 'Ajuste no encontrado');
  return { section };
};
