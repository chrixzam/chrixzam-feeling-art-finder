 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/feeling-art-finder/src/App.jsx b/feeling-art-finder/src/App.jsx
index 829a7343a2d99243f1c9fc120c5276b24136f8d7..9c5b16a7dad0bb460ef19c87eb970a1a7f239d4b 100644
--- a/feeling-art-finder/src/App.jsx
+++ b/feeling-art-finder/src/App.jsx
@@ -1,28 +1,30 @@
 import { useMemo, useState, useEffect } from 'react'
 import ArtCard from './ArtCard'
 
+const MAX_RESULTS = 500
+
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
diff --git a/feeling-art-finder/src/App.jsx b/feeling-art-finder/src/App.jsx
index 829a7343a2d99243f1c9fc120c5276b24136f8d7..9c5b16a7dad0bb460ef19c87eb970a1a7f239d4b 100644
--- a/feeling-art-finder/src/App.jsx
+++ b/feeling-art-finder/src/App.jsx
@@ -89,184 +91,230 @@ function deriveTermsFromText(text) {
 
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
 
-async function searchMet(q) {
+async function searchMet(q, limit = MAX_RESULTS) {
   // Search Met Museum API by query string, restrict to images
   const searchUrl = new URL('https://collectionapi.metmuseum.org/public/collection/v1/search')
   searchUrl.searchParams.set('q', q)
   searchUrl.searchParams.set('hasImages', 'true')
 
   const res = await fetch(searchUrl)
   if (!res.ok) throw new Error('Search failed')
   const data = await res.json()
-  const ids = (data.objectIDs || []).slice(0, 48) // fetch a bit more to allow reordering
-  const items = []
-
-  for (const id of ids) {
-    const r = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`)
-    if (!r.ok) continue
-    const obj = await r.json()
-    if (!obj.primaryImageSmall) continue
-    const item = {
-      id: obj.objectID,
-      title: obj.title,
-      artist: obj.artistDisplayName || 'Unknown',
-      date: obj.objectDate || obj.objectBeginDate || '',
-      img: obj.primaryImageSmall,
-      url: obj.objectURL || `https://www.metmuseum.org/art/collection/search/${obj.objectID}`,
-      medium: obj.medium || '',
-      classification: obj.classification || '',
+  const ids = (data.objectIDs || []).slice(0, limit)
+
+  const itemPromises = ids.map(async id => {
+    try {
+      const r = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`)
+      if (!r.ok) return null
+      const obj = await r.json()
+      if (!obj.primaryImageSmall) return null
+      return {
+        id: obj.objectID,
+        title: obj.title,
+        artist: obj.artistDisplayName || 'Unknown',
+        date: obj.objectDate || obj.objectBeginDate || '',
+        img: obj.primaryImageSmall,
+        url: obj.objectURL || `https://www.metmuseum.org/art/collection/search/${obj.objectID}`,
+        medium: obj.medium || '',
+        classification: obj.classification || '',
+      }
+    } catch {
+      return null
     }
-    items.push(item)
-  }
+  })
+
+  const items = (await Promise.all(itemPromises)).filter(Boolean)
 
   // Bias results toward paintings first
   const isPainting = (it) => {
     const m = it.medium.toLowerCase()
     const c = it.classification.toLowerCase()
     return c.includes('painting') || /(oil|tempera|watercolor|gouache|acrylic)/.test(m)
   }
   const paintings = items.filter(isPainting)
   const others = items.filter(it => !isPainting(it))
-  return [...paintings, ...others].slice(0, 24)
+  return [...paintings, ...others].slice(0, limit)
+}
+
+async function searchAIC(q, limit = MAX_RESULTS) {
+  const searchUrl = new URL('https://api.artic.edu/api/v1/artworks/search')
+  searchUrl.searchParams.set('q', q)
+  searchUrl.searchParams.set('fields', 'id,title,artist_display,date_display,image_id')
+  searchUrl.searchParams.set('limit', String(limit))
+
+  const res = await fetch(searchUrl)
+  if (!res.ok) throw new Error('Search failed')
+  const data = await res.json()
+
+  return (data.data || [])
+    .filter(obj => obj.image_id)
+    .map(obj => ({
+      id: `aic-${obj.id}`,
+      title: obj.title,
+      artist: obj.artist_display || 'Unknown',
+      date: obj.date_display || '',
+      img: `https://www.artic.edu/iiif/2/${obj.image_id}/full/843,/0/default.jpg`,
+      url: `https://www.artic.edu/artworks/${obj.id}`,
+      medium: '',
+      classification: '',
+    }))
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
 
   const suggestedTerms = useMemo(() => deriveTermsFromText(text), [text])
 
-  function buildQuery(input) {
-    // Use derived terms if present; fall back to first 3 words
-    const terms = suggestedTerms.length ? suggestedTerms : input.split(/\s+/).slice(0, 3)
-    return terms.join(' ')
-  }
-
   async function handleSearch(e) {
     e.preventDefault()
     setError('')
-    const q = buildQuery(text.trim())
+    let terms = suggestedTerms.length
+      ? [...suggestedTerms]
+      : text.trim().toLowerCase().split(/\s+/).slice(0, 3)
+    const q = terms.join(' ')
     setQuery(q)
     setLoading(true)
     try {
-      let items = await searchMet(q)
+      let [metItems, aicItems] = await Promise.all([searchMet(q), searchAIC(q)])
+
       // Fallback: if over-constrained query yields nothing, try without the painting bias
-      if (items.length === 0 && q.includes('painting')) {
-        const fallbackQ = q
-          .split(/\s+/)
-          .filter(t => t.toLowerCase() !== 'painting')
-          .slice(0, 3)
-          .join(' ')
+      if (metItems.length === 0 && aicItems.length === 0 && terms.includes('painting')) {
+        terms = terms.filter(t => t.toLowerCase() !== 'painting')
+        const fallbackQ = terms.join(' ')
         if (fallbackQ) {
-          items = await searchMet(fallbackQ)
+          ;[metItems, aicItems] = await Promise.all([searchMet(fallbackQ), searchAIC(fallbackQ)])
           setQuery(`${q} (fallback → ${fallbackQ})`)
         }
       }
-      setResults(items)
+
+      const seen = new Set()
+      let items = [...metItems, ...aicItems].filter(it => {
+        if (seen.has(it.id)) return false
+        seen.add(it.id)
+        return true
+      })
+
+      // Broaden search with individual terms until we have at least 50 results
+      if (items.length < 50) {
+        for (const term of terms) {
+          const [m, a] = await Promise.all([searchMet(term), searchAIC(term)])
+          for (const it of [...m, ...a]) {
+            if (!seen.has(it.id)) {
+              seen.add(it.id)
+              items.push(it)
+            }
+            if (items.length >= MAX_RESULTS) break
+          }
+          if (items.length >= 50 || items.length >= MAX_RESULTS) break
+        }
+      }
+
+      setResults(items.slice(0, MAX_RESULTS))
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
 
-      {query && <p className="hint">Searching The Met for: <strong>{query}</strong></p>}
+      {query && <p className="hint">Searching The Met and Art Institute of Chicago for: <strong>{query}</strong></p>}
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
-        <small>Source: The Met Collection API. This is a demo; refine the emotion mapping as you like.</small>
+        <small>Sources: The Met Collection API and Art Institute of Chicago API. This is a demo; refine the emotion mapping as you like.</small>
       </footer>
     </div>
   )
 }
 
EOF
)