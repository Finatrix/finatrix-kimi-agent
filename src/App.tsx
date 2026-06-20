import { Routes, Route } from 'react-router'
import Home from './pages/Home'
import ToolsPage from './pages/ToolsPage'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Profile from './pages/Profile'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/tools" element={<ToolsPage />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/profile" element={<Profile />} />
    </Routes>
  )
}
