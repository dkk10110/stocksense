import { Outlet } from 'react-router-dom';
import NavBar from './NavBar';
import BuyModal from './BuyModal';

export default function AppLayout() {
  return (
    <div id="app" style={{ display: 'block' }}>
      <NavBar />
      <div className="scr on">
        <Outlet />
      </div>
      <BuyModal />
    </div>
  );
}
