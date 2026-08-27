import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../lib/api';

const links = [
  { to: '/signals', label: 'Signals', icon: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /> },
  { to: '/discovery', label: 'Discovery', icon: <><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></> },
  { to: '/watchlist', label: 'Watchlist', icon: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></> },
  { to: '/positions', label: 'Positions', icon: <><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></> },
  { to: '/alerts', label: 'Alerts', icon: <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></> },
  { to: '/profile', label: 'Profile', icon: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></> },
];

export default function NavBar() {
  const { user } = useAuth();
  const { data: alerts } = useQuery({
    queryKey: ['alerts'],
    queryFn: () => api.get('/alerts').then((r) => r.data),
  });
  const initials = user?.name?.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2) || '';

  return (
    <div className="topbar">
      <div className="tb-brand">
        <div className="tb-icon">
          <svg viewBox="0 0 24 24"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></svg>
        </div>
        Stock<span>Sense</span>
      </div>
      <nav className="tb-nav">
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} className={({ isActive }) => `nb${isActive ? ' on' : ''}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{l.icon}</svg>
            <span>{l.label}</span>
            {l.to === '/alerts' && alerts?.length > 0 && <span className="nb-badge">{alerts.length}</span>}
          </NavLink>
        ))}
      </nav>
      <div className="tb-user">
        <div className="av">{initials}</div>
        <span className="tb-uname">{user?.name?.split(' ')[0]}</span>
      </div>
    </div>
  );
}
