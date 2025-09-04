import React from 'react'

export default function ArtCard({ item, liked, onToggle }) {
  return (
    <div className="card">
      <button
        className={`like-btn${liked ? ' liked' : ''}`}
        onClick={e => {
          e.preventDefault()
          e.stopPropagation()
          onToggle(item)
        }}
        aria-label={liked ? 'Unlike art' : 'Like art'}
      >
        {liked ? '♥' : '♡'}
      </button>
      <a href={item.url} target="_blank" rel="noreferrer">
        <img src={item.img} alt={`${item.title} by ${item.artist}`} loading="lazy" />
        <div className="meta">
          <h3>{item.title}</h3>
          <p>
            {item.artist}
            {item.date ? `, ${item.date}` : ''}
          </p>
          <p className="medium">{item.medium}</p>
        </div>
      </a>
    </div>
  )
}
