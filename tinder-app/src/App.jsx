import { useState, useRef, useEffect, useCallback } from "react";

// ── Fake profiles ────────────────────────────────────────────────────────────
const PROFILES = [
  {
    id: 1,
    name: "Pascal",
    age: 32,
    bio: "Roi de l'apres-ski. Fan de bonnets rigolos et de soirees festives. Cherche quelqu'un pour partager un vin chaud.",
    location: "Chamonix",
    tags: ["Ski", "Fetes", "Vin chaud", "Montagne"],
    photo: null, // Main profile - uses the uploaded photo
    gradient: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    emoji: "🎿",
  },
  {
    id: 2,
    name: "Sophie",
    age: 28,
    bio: "Passionnee de yoga et de cuisine bio. Toujours en train de voyager ou de preparer un brunch.",
    location: "Paris",
    tags: ["Yoga", "Voyages", "Cuisine", "Nature"],
    gradient: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
    emoji: "🧘‍♀️",
  },
  {
    id: 3,
    name: "Lucas",
    age: 30,
    bio: "Developpeur le jour, DJ le soir. Cherche la personne qui me fera decrocher des ecrans.",
    location: "Lyon",
    tags: ["Tech", "Musique", "Gaming", "Cafe"],
    gradient: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
    emoji: "🎧",
  },
  {
    id: 4,
    name: "Camille",
    age: 26,
    bio: "Artiste et reveus. J'adore les musees, les balades en foret et les discussions jusqu'a 3h du mat.",
    location: "Bordeaux",
    tags: ["Art", "Nature", "Lecture", "Cinema"],
    gradient: "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
    emoji: "🎨",
  },
  {
    id: 5,
    name: "Thomas",
    age: 34,
    bio: "Chef cuisinier avec une passion pour les saveurs du monde. Je cuisine, tu goutes ?",
    location: "Marseille",
    tags: ["Cuisine", "Voyages", "Vin", "Surf"],
    gradient: "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
    emoji: "👨‍🍳",
  },
  {
    id: 6,
    name: "Emma",
    age: 29,
    bio: "Veterinaire et amoureuse des animaux. Mon chat est mon meilleur wingman.",
    location: "Toulouse",
    tags: ["Animaux", "Randonnee", "Photo", "Cafe"],
    gradient: "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)",
    emoji: "🐱",
  },
];

// ── Swipe Card Component ─────────────────────────────────────────────────────
function SwipeCard({ profile, onSwipe, isTop }) {
  const cardRef = useRef(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const currentX = useRef(0);
  const isDragging = useRef(false);
  const [offset, setOffset] = useState(0);
  const [opacity, setOpacity] = useState(1);
  const [swipeLabel, setSwipeLabel] = useState(null);
  const [exiting, setExiting] = useState(false);

  const handleStart = useCallback((clientX, clientY) => {
    if (!isTop || exiting) return;
    isDragging.current = true;
    startX.current = clientX;
    startY.current = clientY;
    currentX.current = 0;
  }, [isTop, exiting]);

  const handleMove = useCallback((clientX) => {
    if (!isDragging.current) return;
    const dx = clientX - startX.current;
    currentX.current = dx;
    setOffset(dx);
    const progress = Math.min(Math.abs(dx) / 150, 1);
    setOpacity(1 - progress * 0.3);
    if (dx > 50) setSwipeLabel("LIKE");
    else if (dx < -50) setSwipeLabel("NOPE");
    else setSwipeLabel(null);
  }, []);

  const handleEnd = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const dx = currentX.current;
    if (Math.abs(dx) > 120) {
      const direction = dx > 0 ? "right" : "left";
      setExiting(true);
      setOffset(dx > 0 ? 600 : -600);
      setOpacity(0);
      setTimeout(() => onSwipe(direction), 300);
    } else {
      setOffset(0);
      setOpacity(1);
      setSwipeLabel(null);
    }
  }, [onSwipe]);

  // Mouse events
  const onMouseDown = (e) => handleStart(e.clientX, e.clientY);
  const onMouseMove = useCallback((e) => handleMove(e.clientX), [handleMove]);
  const onMouseUp = useCallback(() => handleEnd(), [handleEnd]);

  // Touch events
  const onTouchStart = (e) => handleStart(e.touches[0].clientX, e.touches[0].clientY);
  const onTouchMove = useCallback((e) => handleMove(e.touches[0].clientX), [handleMove]);
  const onTouchEnd = useCallback(() => handleEnd(), [handleEnd]);

  useEffect(() => {
    if (!isTop) return;
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [isTop, onMouseMove, onMouseUp, onTouchMove, onTouchEnd]);

  const rotation = offset * 0.08;

  return (
    <div
      ref={cardRef}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      style={{
        position: "absolute",
        width: "100%",
        height: "100%",
        borderRadius: 20,
        overflow: "hidden",
        cursor: isTop ? "grab" : "default",
        transform: `translateX(${offset}px) rotate(${rotation}deg) scale(${isTop ? 1 : 0.95})`,
        opacity: isTop ? opacity : 0.6,
        transition: isDragging.current ? "none" : "all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
        zIndex: isTop ? 10 : 5,
        userSelect: "none",
        WebkitUserSelect: "none",
        touchAction: "none",
        boxShadow: isTop
          ? "0 20px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05)"
          : "0 10px 30px rgba(0,0,0,0.3)",
      }}
    >
      {/* Photo area */}
      <div
        style={{
          width: "100%",
          height: "100%",
          background: profile.gradient,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        {profile.photo ? (
          <img
            src={profile.photo}
            alt={profile.name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            draggable={false}
          />
        ) : (
          <span style={{ fontSize: 120, filter: "drop-shadow(0 4px 20px rgba(0,0,0,0.3))" }}>
            {profile.emoji}
          </span>
        )}

        {/* Gradient overlay at bottom */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "55%",
            background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 50%, transparent 100%)",
          }}
        />

        {/* Swipe labels */}
        {swipeLabel === "LIKE" && (
          <div style={{
            position: "absolute", top: 40, left: 24,
            border: "4px solid #00d4aa", borderRadius: 12,
            padding: "8px 20px", transform: "rotate(-15deg)",
            color: "#00d4aa", fontSize: 36, fontWeight: 800,
            letterSpacing: "0.1em",
            textShadow: "0 0 20px rgba(0,212,170,0.5)",
          }}>LIKE</div>
        )}
        {swipeLabel === "NOPE" && (
          <div style={{
            position: "absolute", top: 40, right: 24,
            border: "4px solid #ff4d6d", borderRadius: 12,
            padding: "8px 20px", transform: "rotate(15deg)",
            color: "#ff4d6d", fontSize: 36, fontWeight: 800,
            letterSpacing: "0.1em",
            textShadow: "0 0 20px rgba(255,77,109,0.5)",
          }}>NOPE</div>
        )}

        {/* Profile info */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          padding: "20px 24px 24px",
        }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 32, fontWeight: 700, color: "#fff" }}>{profile.name}</span>
            <span style={{ fontSize: 24, fontWeight: 300, color: "rgba(255,255,255,0.8)" }}>{profile.age}</span>
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 14, color: "rgba(255,255,255,0.7)", marginBottom: 10,
          }}>
            <span>📍</span> {profile.location}
          </div>
          <p style={{
            fontSize: 15, color: "rgba(255,255,255,0.85)",
            margin: "0 0 14px 0", lineHeight: 1.5,
          }}>
            {profile.bio}
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {profile.tags.map((tag) => (
              <span key={tag} style={{
                background: "rgba(255,255,255,0.15)",
                backdropFilter: "blur(10px)",
                borderRadius: 20, padding: "5px 14px",
                fontSize: 12, color: "rgba(255,255,255,0.9)",
                fontWeight: 500,
              }}>{tag}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Match Screen ─────────────────────────────────────────────────────────────
function MatchScreen({ profile, onContinue }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.85)",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      animation: "fadeIn 0.5s ease",
    }}>
      <div style={{
        fontSize: 60, marginBottom: 10,
        animation: "bounce 0.6s ease",
      }}>💘</div>
      <h2 style={{
        fontSize: 42, fontWeight: 800, margin: "0 0 8px 0",
        background: "linear-gradient(135deg, #ff6b9d, #ff4d6d, #ff8a5c)",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        letterSpacing: "-0.02em",
      }}>It's a Match!</h2>
      <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 16, margin: "0 0 30px 0" }}>
        Toi et <strong style={{ color: "#fff" }}>{profile.name}</strong> vous vous aimez bien
      </p>
      <div style={{
        width: 100, height: 100, borderRadius: "50%",
        background: profile.gradient,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 50, marginBottom: 30,
        boxShadow: "0 0 40px rgba(255,77,109,0.3)",
        border: "3px solid rgba(255,255,255,0.2)",
      }}>{profile.emoji}</div>
      <button onClick={onContinue} style={{
        background: "linear-gradient(135deg, #ff6b9d, #ff4d6d)",
        border: "none", borderRadius: 30,
        color: "#fff", fontSize: 16, fontWeight: 700,
        padding: "14px 40px", cursor: "pointer",
        boxShadow: "0 8px 30px rgba(255,77,109,0.4)",
        letterSpacing: "0.05em",
      }}>Continuer</button>
    </div>
  );
}

// ── No More Profiles ─────────────────────────────────────────────────────────
function EmptyState({ onReset }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      height: "100%", textAlign: "center", padding: 30,
    }}>
      <div style={{ fontSize: 80, marginBottom: 20 }}>😢</div>
      <h2 style={{ fontSize: 24, fontWeight: 700, color: "#fff", margin: "0 0 8px 0" }}>
        Plus de profils !
      </h2>
      <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 15, margin: "0 0 30px 0" }}>
        Tu as vu tout le monde dans ta zone
      </p>
      <button onClick={onReset} style={{
        background: "linear-gradient(135deg, #667eea, #764ba2)",
        border: "none", borderRadius: 30,
        color: "#fff", fontSize: 15, fontWeight: 600,
        padding: "12px 36px", cursor: "pointer",
        boxShadow: "0 8px 30px rgba(102,126,234,0.3)",
      }}>Recommencer</button>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [profiles, setProfiles] = useState(PROFILES);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [matches, setMatches] = useState([]);
  const [showMatch, setShowMatch] = useState(null);
  const [likes, setLikes] = useState(0);
  const [nopes, setNopes] = useState(0);

  const handleSwipe = useCallback((direction) => {
    const profile = profiles[currentIndex];
    if (direction === "right") {
      setLikes((l) => l + 1);
      // 50% chance of match
      if (Math.random() > 0.5) {
        setMatches((m) => [...m, profile]);
        setShowMatch(profile);
      }
    } else {
      setNopes((n) => n + 1);
    }
    setCurrentIndex((i) => i + 1);
  }, [currentIndex, profiles]);

  const handleButtonSwipe = (direction) => {
    if (currentIndex >= profiles.length) return;
    handleSwipe(direction);
  };

  const handleReset = () => {
    setProfiles([...PROFILES].sort(() => Math.random() - 0.5));
    setCurrentIndex(0);
  };

  const remaining = profiles.length - currentIndex;

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(180deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      display: "flex", flexDirection: "column",
      alignItems: "center",
      overflow: "hidden",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { margin: 0; padding: 0; width: 100%; min-height: 100vh; overflow-x: hidden; }
        #root { width: 100%; min-height: 100vh; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes bounce {
          0% { transform: scale(0.3); opacity: 0; }
          50% { transform: scale(1.1); }
          70% { transform: scale(0.9); }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>

      {/* Header */}
      <div style={{
        width: "100%", maxWidth: 440, padding: "20px 24px 10px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 28 }}>🔥</span>
          <span style={{
            fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em",
            background: "linear-gradient(135deg, #ff6b9d, #ff4d6d)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>FlameMatch</span>
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
          <span>💚 {likes}</span>
          <span>❌ {nopes}</span>
          <span>💘 {matches.length}</span>
        </div>
      </div>

      {/* Card stack */}
      <div style={{
        flex: 1, width: "100%", maxWidth: 440,
        padding: "10px 20px 0",
        position: "relative",
        height: "calc(100vh - 160px)",
        maxHeight: 600,
        minHeight: 400,
      }}>
        {remaining > 0 ? (
          <>
            {/* Show next card behind */}
            {currentIndex + 1 < profiles.length && (
              <SwipeCard
                key={profiles[currentIndex + 1].id}
                profile={profiles[currentIndex + 1]}
                onSwipe={() => {}}
                isTop={false}
              />
            )}
            {/* Top card */}
            <SwipeCard
              key={profiles[currentIndex].id}
              profile={profiles[currentIndex]}
              onSwipe={handleSwipe}
              isTop={true}
            />
          </>
        ) : (
          <EmptyState onReset={handleReset} />
        )}
      </div>

      {/* Action buttons */}
      {remaining > 0 && (
        <div style={{
          display: "flex", gap: 24, padding: "16px 0 30px",
          alignItems: "center", justifyContent: "center",
        }}>
          <button onClick={() => handleButtonSwipe("left")} style={{
            width: 64, height: 64, borderRadius: "50%",
            background: "rgba(255,77,109,0.1)", border: "2px solid rgba(255,77,109,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 28, cursor: "pointer",
            transition: "all 0.2s ease",
            boxShadow: "0 4px 15px rgba(255,77,109,0.15)",
          }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.1)"; e.currentTarget.style.background = "rgba(255,77,109,0.2)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.background = "rgba(255,77,109,0.1)"; }}
          >✕</button>

          <button onClick={() => handleButtonSwipe("right")} style={{
            width: 72, height: 72, borderRadius: "50%",
            background: "linear-gradient(135deg, #00d4aa, #00b894)",
            border: "none",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 32, cursor: "pointer",
            transition: "all 0.2s ease",
            boxShadow: "0 8px 25px rgba(0,212,170,0.3)",
          }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.1)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
          >💚</button>
        </div>
      )}

      {/* Matches bar */}
      {matches.length > 0 && (
        <div style={{
          width: "100%", maxWidth: 440,
          padding: "0 20px 20px",
        }}>
          <div style={{
            fontSize: 11, color: "rgba(255,255,255,0.3)",
            textTransform: "uppercase", letterSpacing: "0.1em",
            marginBottom: 8, fontWeight: 600,
          }}>Tes matches ({matches.length})</div>
          <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4 }}>
            {matches.map((m) => (
              <div key={m.id} style={{
                width: 52, height: 52, borderRadius: "50%", flexShrink: 0,
                background: m.gradient,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 24,
                border: "2px solid rgba(255,107,157,0.5)",
                boxShadow: "0 4px 15px rgba(255,77,109,0.2)",
              }}>{m.emoji}</div>
            ))}
          </div>
        </div>
      )}

      {/* Match popup */}
      {showMatch && (
        <MatchScreen
          profile={showMatch}
          onContinue={() => setShowMatch(null)}
        />
      )}
    </div>
  );
}
