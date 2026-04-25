import { useEffect, useState } from 'react'
import axios from 'axios'

const API = '/api'

export default function App() {
  const [ammo, setAmmo] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    axios.get(`${API}/ammo`)
      .then(res => setAmmo(res.data))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <h1 className="text-2xl font-bold text-amber-400">🎯 AmmoLedger</h1>
        <p className="text-gray-400 text-sm">Your ammo inventory, on and off the range</p>
      </header>

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">Inventory</h2>
          <button className="bg-amber-500 hover:bg-amber-400 text-gray-950 font-semibold px-4 py-2 rounded-lg transition">
            + Add Ammo
          </button>
        </div>

        {loading ? (
          <p className="text-gray-400">Loading...</p>
        ) : ammo.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-4xl mb-4">📦</p>
            <p className="text-lg">No ammo in inventory yet.</p>
            <p className="text-sm mt-1">Click "Add Ammo" to get started.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {ammo.map(item => (
              <div key={item.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-lg">{item.caliber}</p>
                  <p className="text-gray-400 text-sm">{item.brand} · {item.grain}gr</p>
                  {item.notes && <p className="text-gray-500 text-xs mt-1">{item.notes}</p>}
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold text-amber-400">{item.quantity}</p>
                  <p className="text-gray-500 text-xs">rounds</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
