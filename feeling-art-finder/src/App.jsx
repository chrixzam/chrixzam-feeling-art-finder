import { useMemo, useState, useEffect } from 'react'
import ArtCard from './ArtCard'

// Simple emotion → keyword map; tweak freely
const EMOTION_MAP = [
  { keys: ['happy','joy','grateful','optimistic'], terms: ['joy', 'celebration', 'sunlight', 'yellow', 'dance'] },
  { keys: ['sad','down','blue','melancholy'], terms: ['melancholy', 'blue', 'nocturne', 'rain'] },
  { keys: ['calm','peaceful','serene','relaxed'], terms: ['landscape', 'sea', 'twilight', 'blue'] },
  { keys: ['anxious','stressed','uneasy'], terms: ['night', 'shadow', 'storm', 'abstract'] },
  { keys: ['angry','mad','furious'], terms: ['storm', 'battle', 'red', 'expressionism'] },
  { keys: ['love','romantic','tender'], terms: ['kiss', 'embrace', 'venus', 'cupid'] },
  { keys: ['lonely','isolated'], terms: ['nocturne', 'solitude', 'night', 'isolation'] },
  { keys: ['hopeful','inspired'], terms: ['sunrise', 'spring', 'garden', 'light'] },
  { keys: ['nostalgic','homesick'], terms: ['vintage', 'childhood', 'memory', 'home'] },
  { keys: ['curious','inquisitive'], terms: ['invention', 'astronomy', 'book', 'science'] }
]

async function searchMet(q) {
  // Search Met Museum API by query string, restrict to images
  const searchUrl = new URL('https://collectionapi.metmuseum.org/public/collection/v1/search')
  searchUrl.searchParams.set('q', q)
  searchUrl.searchParams.set('hasImages', 'true')

  const res = await fetch(searchUrl)
  if (!res.ok) throw new Error('Search failed')
  const data = await res.json()
  const ids = (data.objectIDs || []).slice(0, 24) // take up to 24
  const items = []

  for (const id of ids) {
    const r = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`)
    if (!r.ok) continue
    const obj = await r.json()
    if (!obj.primaryImageSmall) continue
    items.push({
      id: obj.objectID,
      title: obj.title,
      artist: obj.artistDisplayName || 'Unknown',
      date: obj.objectDate || obj.objectBeginDate || '',
      img: obj.primaryImageSmall,
      url: obj.objectURL || `https://www.metmuseum.org/art/collection/search/${obj.objectID}`,
      medium: obj.medium || ''
    })
  }

  return items
}

export default function App() {
  const [text, setText] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState([])
  const [error, setError] = useState('')
  const [likes, setLikes] = useState(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('likes') : null
    return saved ? JSON.parse(saved) : []
  })

  useEffect(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('likes', JSON.stringify(likes))
    }
  }, [likes])

  function toggleLike(item) {
    setLikes(prev => {
      const exists = prev.some(i => i.id === item.id)
      return exists ? prev.filter(i => i.id !== item.id) : [...prev, item]
    })
  }

  const suggestedTerms = useMemo(() => {
    const t = text.toLowerCase()
    for (const group of EMOTION_MAP) {
      if (group.keys.some(k => t.includes(k))) return group.terms
    }
    return []
  }, [text])

  function buildQuery(input) {
    // Use mapped terms if we found any; fall back to user text
    const terms = suggestedTerms.length ? suggestedTerms.slice(0, 3) : input.split(/\s+/).slice(0, 3)
    return terms.join(' ')
  }

  async function handleSearch(e) {
    e.preventDefault()
    setError('')
    const q = buildQuery(text.trim())
    setQuery(q)
    setLoading(true)
    try {
      const items = await searchMet(q)
      setResults(items)
    } catch {
      setError('Sorry — something went wrong fetching art. Try again in a moment.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="wrap">
      <header>
        <h1>Feeling → Art</h1>
        <p className="sub">Type how you feel. We’ll fetch artwork that matches the vibe.</p>
      </header>

      <form onSubmit={handleSearch} className="bar">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="e.g., I feel calm but a little nostalgic"
          aria-label="Describe your feelings"
        />
        <button disabled={!text.trim() || loading}>{loading ? 'Searching…' : 'Find art'}</button>
      </form>

      {suggestedTerms.length > 0 && (
        <div className="chips" aria-live="polite">
          Suggested terms: {suggestedTerms.map(t => <span key={t} className="chip">{t}</span>)}
        </div>
      )}

      {query && <p className="hint">Searching The Met for: <strong>{query}</strong></p>}
      {error && <p className="error">{error}</p>}

      <section className="grid">
        {results.map(item => (
          <ArtCard
            key={item.id}
            item={item}
            liked={likes.some(i => i.id === item.id)}
            onToggle={toggleLike}
          />
        ))}
      </section>

      {!loading && results.length === 0 && query && (
        <p className="empty">No matches. Try different words like “landscape”, “sunlight”, or “nocturne”.</p>
      )}

      {likes.length > 0 && (
        <>
          <h2>Liked Art</h2>
          <section className="grid">
            {likes.map(item => (
              <ArtCard key={item.id} item={item} liked onToggle={toggleLike} />
            ))}
          </section>
        </>
      )}

      <footer>
        <small>Source: The Met Collection API. This is a demo; refine the emotion mapping as you like.</small>
      </footer>
    </div>
  )
}
