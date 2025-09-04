import { useMemo, useState, useEffect } from 'react'
import ArtCard from './ArtCard'

// Enhanced emotion → art-term rules
const EMOTION_RULES = [
  {
    keys: ['happy','joy','joyful','grateful','optimistic','cheerful','content'],
    core: ['sunlight','festival','garden','yellow','impressionism'],
    strong: ['celebration','dance','carnival','bright','festival']
  },
  {
    keys: ['sad','down','melancholy','depressed','sorrow','blue'],
    core: ['melancholy','nocturne','rain','twilight','blue'],
    strong: ['mourning','winter','night','shadow','solitude']
  },
  {
    keys: ['calm','peaceful','serene','relaxed','tranquil'],
    core: ['landscape','sea','horizon','twilight','pastoral'],
    strong: ['still water','dusk','harbor','moonlight']
  },
  {
    keys: ['anxious','stressed','uneasy','nervous','tense','fearful','worried'],
    core: ['shadow','night','storm','abstract','gloom'],
    strong: ['tempest','thunderstorm','drama','red','expressionism']
  },
  {
    keys: ['angry','mad','furious','rage','irritated'],
    core: ['storm','battle','red','drama'],
    strong: ['tempest','conflagration','violent','expressionism']
  },
  {
    keys: ['love','romantic','tender','affection','passion','heart'],
    core: ['kiss','embrace','venus','couple','mythology'],
    strong: ['cupid','amour','wedding','allegory of love']
  },
  {
    keys: ['lonely','alone','isolated','isolation'],
    core: ['solitude','nocturne','empty street','night'],
    strong: ['moonlight','harbor at night','interior','single figure']
  },
  {
    keys: ['hopeful','inspired','uplifted','optimism'],
    core: ['sunrise','spring','garden','light','dawn'],
    strong: ['sunburst','golden light','festival','renewal']
  },
  {
    keys: ['nostalgic','homesick','yearning','wistful','remember'],
    core: ['vintage','childhood','memory','home','pastoral'],
    strong: ['domestic interior','sepia','old town']
  },
  {
    keys: ['curious','inquisitive','wonder','interested'],
    core: ['astronomy','invention','book','science','learned'],
    strong: ['observatory','cabinet of curiosities','atlas']
  }
]

// Auxiliary vocab the user might type directly
const COLOR_TERMS = ['blue','red','yellow','gold','golden','green','emerald','pink','purple','violet','black','white','silver']
const SCENE_TERMS = ['sea','ocean','harbor','river','landscape','mountain','forest','garden','city','street','interior','church','portrait','self-portrait','still life','flowers']
const TIME_WEATHER_TERMS = ['night','moonlight','nocturne','dawn','sunrise','sunset','twilight','storm','rain','snow','winter','autumn','spring','summer']

function intensityScore(text) {
  let score = 0
  const t = text.toLowerCase()
  if (/[!]{1,}/.test(t)) score++
  if (/(very|really|so|extremely|super|incredibly)\s+/.test(t)) score++
  if (/(overwhelmed|ecstatic|devastated|furious|terrified|panic)/.test(t)) score++
  return score
}

function deriveTermsFromText(text) {
  const t = text.toLowerCase()
  const strong = intensityScore(t) >= 2

  // 1) Gather emotion-based terms
  const emotionTerms = []
  for (const rule of EMOTION_RULES) {
    if (rule.keys.some(k => t.includes(k))) {
      emotionTerms.push(...(strong && rule.strong ? rule.strong : rule.core))
    }
  }

  // 2) Add any explicit colors / scenes / time-weather words present
  const extra = []
  for (const w of [...COLOR_TERMS, ...SCENE_TERMS, ...TIME_WEATHER_TERMS]) {
    if (t.includes(w)) extra.push(w)
  }

  // 3) If we didn't match an emotion, fall back to a gentle default
  if (emotionTerms.length === 0) {
    // try to infer tone by some adjectives
    if (/(calm|peaceful|serene)/.test(t)) emotionTerms.push('landscape','twilight','sea')
    else if (/(sad|blue|down)/.test(t)) emotionTerms.push('nocturne','rain','shadow')
    else if (/(happy|joy|cheerful)/.test(t)) emotionTerms.push('sunlight','garden','yellow')
  }

  // 4) Prefer painting-y descriptors to bias results toward paintings
  // Use a single non-conflicting hint; multiple mediums (oil + watercolor) can over-constrain Met search
  const paintingBias = ['painting']

  const combined = [...paintingBias, ...emotionTerms, ...extra]
  // Deduplicate preserving order
  const seen = new Set()
  const unique = []
  for (const term of combined) {
    const key = term.toLowerCase()
    if (!seen.has(key)) { seen.add(key); unique.push(term) }
  }
  // Limit length (more than 4–5 terms tends to dilute results)
  return unique.slice(0, 5)
}

async function searchMet(q) {
  // Search Met Museum API by query string, restrict to images
  const searchUrl = new URL('https://collectionapi.metmuseum.org/public/collection/v1/search')
  searchUrl.searchParams.set('q', q)
  searchUrl.searchParams.set('hasImages', 'true')

  const res = await fetch(searchUrl)
  if (!res.ok) throw new Error('Search failed')
  const data = await res.json()
  const ids = (data.objectIDs || []).slice(0, 500)

  const itemPromises = ids.map(async id => {
    try {
      const r = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`)
      if (!r.ok) return null
      const obj = await r.json()
      if (!obj.primaryImageSmall) return null
      return {
        id: obj.objectID,
        title: obj.title,
        artist: obj.artistDisplayName || 'Unknown',
        date: obj.objectDate || obj.objectBeginDate || '',
        img: obj.primaryImageSmall,
        url: obj.objectURL || `https://www.metmuseum.org/art/collection/search/${obj.objectID}`,
        medium: obj.medium || '',
        classification: obj.classification || '',
      }
    } catch {
      return null
    }
  })

  const items = (await Promise.all(itemPromises)).filter(Boolean)

  // Bias results toward paintings first
  const isPainting = (it) => {
    const m = it.medium.toLowerCase()
    const c = it.classification.toLowerCase()
    return c.includes('painting') || /(oil|tempera|watercolor|gouache|acrylic)/.test(m)
  }
  const paintings = items.filter(isPainting)
  const others = items.filter(it => !isPainting(it))
  return [...paintings, ...others].slice(0, 500)
}

async function searchAIC(q) {
  const searchUrl = new URL('https://api.artic.edu/api/v1/artworks/search')
  searchUrl.searchParams.set('q', q)
  searchUrl.searchParams.set('fields', 'id,title,artist_display,date_display,image_id')
  searchUrl.searchParams.set('limit', '500')

  const res = await fetch(searchUrl)
  if (!res.ok) throw new Error('Search failed')
  const data = await res.json()

  return (data.data || [])
    .filter(obj => obj.image_id)
    .map(obj => ({
      id: `aic-${obj.id}`,
      title: obj.title,
      artist: obj.artist_display || 'Unknown',
      date: obj.date_display || '',
      img: `https://www.artic.edu/iiif/2/${obj.image_id}/full/843,/0/default.jpg`,
      url: `https://www.artic.edu/artworks/${obj.id}`,
      medium: '',
      classification: '',
    }))
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
  const [tab, setTab] = useState('search')

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

  const suggestedTerms = useMemo(() => deriveTermsFromText(text), [text])

  function buildQuery(input) {
    // Use derived terms if present; fall back to first 3 words
    const terms = suggestedTerms.length ? suggestedTerms : input.split(/\s+/).slice(0, 3)
    return terms.join(' ')
  }

  async function handleSearch(e) {
    e.preventDefault()
    setError('')
    const q = buildQuery(text.trim())
    setQuery(q)
    setLoading(true)
    try {
      let [metItems, aicItems] = await Promise.all([searchMet(q), searchAIC(q)])
      // Fallback: if over-constrained query yields nothing, try without the painting bias
      if (metItems.length === 0 && aicItems.length === 0 && q.includes('painting')) {
        const fallbackQ = q
          .split(/\s+/)
          .filter(t => t.toLowerCase() !== 'painting')
          .slice(0, 3)
          .join(' ')
        if (fallbackQ) {
          ;[metItems, aicItems] = await Promise.all([searchMet(fallbackQ), searchAIC(fallbackQ)])
          setQuery(`${q} (fallback → ${fallbackQ})`)
        }
      }
      const items = [...metItems, ...aicItems].slice(0, 500)
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
        <nav className="tabs">
          <button
            className={tab === 'search' ? 'active' : ''}
            onClick={() => setTab('search')}
            type="button"
          >
            Search
          </button>
          <button
            className={tab === 'likes' ? 'active' : ''}
            onClick={() => setTab('likes')}
            type="button"
          >
            Likes ({likes.length})
          </button>
        </nav>
      </header>

      {tab === 'search' && (
        <>
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

          {query && <p className="hint">Searching The Met and Art Institute of Chicago for: <strong>{query}</strong></p>}
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
        </>
      )}

      {tab === 'likes' && (
        <>
          {likes.length === 0 ? (
            <p className="empty">No liked art yet.</p>
          ) : (
            <section className="grid">
              {likes.map(item => (
                <ArtCard key={item.id} item={item} liked onToggle={toggleLike} />
              ))}
            </section>
          )}
        </>
      )}

      <footer>
        <small>Sources: The Met Collection API and Art Institute of Chicago API. This is a demo; refine the emotion mapping as you like.</small>
      </footer>
    </div>
  )
}
