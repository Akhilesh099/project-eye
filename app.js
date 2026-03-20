// --- Supabase Configuration ---
const SUPABASE_URL = 'https://fuuwbjvroywribizpcrw.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1dXdianZyb3l3cmliaXpwY3J3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5Njk1ODcsImV4cCI6MjA4OTU0NTU4N30.mgmjwzdgMT91qXHKRL1OZ_dbvjcxSCcEHRK75B3U2ZQ'; 

// FIX: We check if it exists, and only create it if 'supabase' isn't already a global variable
let supabaseClient; 

function getSupabase() {
    if (supabaseClient) return supabaseClient;
    if (window.supabase) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        return supabaseClient;
    }
    return null;
}

// --- State ---
let scans = [];
let currentFilter = '';
let uniqueObjectsMap = new Map(); // Keep track of unique objects found today

// --- DOM Elements ---
const gridEl = document.getElementById('detection-grid');
const emptyStateEl = document.getElementById('empty-history-state');
const statTotalEl = document.getElementById('stat-total-scans');
const statObjectsEl = document.getElementById('stat-unique-objects');
const liveFeedImg = document.getElementById('live-feed-image');
const liveFeedEmpty = document.getElementById('live-feed-empty');
const liveTimestamp = document.getElementById('live-timestamp');
const searchInput = document.getElementById('input-filter');
const quickFiltersContainer = document.getElementById('quick-filters');
const btnScanNow = document.getElementById('btn-scan-now');
const template = document.getElementById('scan-card-template');

// --- Initialization ---
function init() {
  bindEvents();
  const client = getSupabase();
  
  if (client) {
    console.log("🚀 Connection Established to Supabase!");
    fetchInitialData();
    subscribeToChanges();
  } else {
    console.warn("⚠️ Supabase SDK not found. Check your index.html script tags.");
    loadDemoData();
  }
}

// --- Event Binding ---
function bindEvents() {
  searchInput.addEventListener('input', (e) => {
    currentFilter = e.target.value.toLowerCase();
    renderGrid();
  });
  
  btnScanNow.addEventListener('click', triggerManualScan);
}

// --- Rendering Logic ---

function renderGrid() {
  // Clear Grid
  gridEl.innerHTML = '';
  
  const filtered = scans.filter(scan => {
    if (!currentFilter) return true;
    return (scan.objects_found || []).some(obj => obj.toLowerCase().includes(currentFilter));
  });
  
  if (filtered.length === 0) {
    emptyStateEl.classList.remove('hidden');
    emptyStateEl.classList.add('flex');
    gridEl.classList.add('hidden');
  } else {
    emptyStateEl.classList.add('hidden');
    emptyStateEl.classList.remove('flex');
    gridEl.classList.remove('hidden');
    
    filtered.forEach(scan => {
      const card = createCardElement(scan);
      gridEl.appendChild(card);
      
      // Trigger animation frame
      requestAnimationFrame(() => {
        setTimeout(() => {
          card.classList.add('card-enter-active');
        }, 50);
      });
    });
  }
  
  updateStats();
  updateQuickFilters();
}

function createCardElement(scan) {
  const clone = template.content.cloneNode(true);
  const cardDiv = clone.querySelector('.scan-card');
  const imgEL = clone.querySelector('.card-img');
  const timeEl = clone.querySelector('.card-time');
  const tagsContainer = clone.querySelector('.card-tags');
  
  imgEL.src = scan.image_url || 'https://via.placeholder.com/400x300?text=No+Image+Found';
  imgEL.onerror = function() {
    this.onerror = null;
    this.src = 'https://via.placeholder.com/400x300?text=Capture+Unavailable';
  };
  timeEl.textContent = formatTime(scan.created_at);
  
  (scan.objects_found || []).forEach(obj => {
    const tag = document.createElement('span');
    tag.className = 'px-2 py-1 text-[11px] uppercase tracking-wider font-semibold rounded bg-space-700 text-neon-green border border-neon-green/30 whitespace-nowrap';
    tag.textContent = obj;
    tagsContainer.appendChild(tag);
  });
  
  cardDiv.dataset.id = scan.id;
  return clone;
}

function updateLiveFeed(scan) {
  if (!scan) return;
  
  liveFeedEmpty.classList.add('hidden');
  liveFeedImg.classList.remove('hidden');
  
  liveFeedImg.src = scan.image_url;
  liveTimestamp.textContent = `LAST SENSOR PING: ${formatTime(scan.created_at).toUpperCase()}`;
}

function updateStats() {
  statTotalEl.textContent = scans.length;
  
  uniqueObjectsMap.clear();
  scans.forEach(scan => {
    (scan.objects_found || []).forEach(obj => uniqueObjectsMap.set(obj.toLowerCase(), obj));
  });
  statObjectsEl.textContent = uniqueObjectsMap.size;
}

function updateQuickFilters() {
  quickFiltersContainer.innerHTML = '';
  
  // Get top 5 objects
  const objCounts = {};
  scans.forEach(scan => {
    (scan.objects_found || []).forEach(obj => {
      objCounts[obj] = (objCounts[obj] || 0) + 1;
    });
  });
  
  const sortedObjs = Object.entries(objCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(entry => entry[0]);
    
  sortedObjs.forEach(obj => {
    const chip = document.createElement('button');
    const isActive = currentFilter === obj.toLowerCase();
    
    chip.className = `px-3 py-1 text-xs uppercase tracking-wider rounded-full transition-colors border ${isActive ? 'bg-neon-green/20 border-neon-green text-neon-green font-bold' : 'bg-space-900 border-space-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'}`;
    chip.textContent = obj;
    chip.onclick = () => {
      if (currentFilter === obj.toLowerCase()) {
        currentFilter = ''; // toggle off
        searchInput.value = '';
      } else {
        currentFilter = obj.toLowerCase();
        searchInput.value = obj;
      }
      renderGrid();
      updateQuickFilters(); // update active styling
    };
    quickFiltersContainer.appendChild(chip);
  });
}

function triggerManualScan() {
  btnScanNow.classList.add('opacity-50', 'pointer-events-none');
  const span = btnScanNow.querySelector('span');
  const originalText = span.innerHTML;
  span.innerHTML = 'Sending Signal...';
  
  setTimeout(() => {
    span.innerHTML = 'Signal Sent!';
    setTimeout(() => {
      btnScanNow.classList.remove('opacity-50', 'pointer-events-none');
      span.innerHTML = originalText;
      
      // If demo mode, inject a mock card after scan
      const client = getSupabase();
      if (!client) {
        addMockScan();
      }
    }, 2000);
  }, 1000);
}

// --- Utilities ---
function parseObjects(rawObjects) {
  if (Array.isArray(rawObjects)) return rawObjects;
  if (typeof rawObjects === 'string') {
    try {
      return JSON.parse(rawObjects.replace(/'/g, '"'));
    } catch (e) {
      return [];
    }
  }
  return [];
}

function formatTime(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hr${diffHours > 1 ? 's' : ''} ago`;
  
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// --- Supabase Integration ---

async function fetchInitialData() {
  const client = getSupabase();
  if (!client) return;
  const { data, error } = await client
    .from('detections')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
    
  if (error) {
    console.error("Error fetching data:", error);
    return;
  }
  
  if (data) {
    scans = data.map(scan => {
      scan.objects_found = parseObjects(scan.objects_found);
      return scan;
    });
    if (scans.length > 0) updateLiveFeed(scans[0]);
    renderGrid();
  }
}

function subscribeToChanges() {
  const client = getSupabase();
  if (!client) return;
  client
    .channel('public:detections')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'detections' }, payload => {
      const newScan = payload.new;
      newScan.objects_found = parseObjects(newScan.objects_found);
      console.log('🚀 NEW SCAN HIT THE BROWSER VIA REALTIME!', newScan);
      
      // Inject at top
      scans.unshift(newScan);
      
      // Re-render
      updateLiveFeed(newScan);
      
      // If no filter or matches filter, prepend to grid
      if (!currentFilter || (newScan.objects_found || []).some(obj => obj.toLowerCase().includes(currentFilter))) {
        const card = createCardElement(newScan);
        gridEl.prepend(card);
        
        requestAnimationFrame(() => {
          setTimeout(() => {
            card.classList.add('card-enter-active');
          }, 10);
        });
        
        emptyStateEl.classList.add('hidden');
        emptyStateEl.classList.remove('flex');
        gridEl.classList.remove('hidden');
      }
      
      updateStats();
      updateQuickFilters();
    })
    .subscribe((status) => {
      if(status === 'SUBSCRIBED') {
         document.getElementById('sync-status').textContent = 'Live Synced';
      }
    });
}

// --- Demo Mode Fallback (When no Supabase configured) ---
const mockImages = [
  'https://images.unsplash.com/photo-1542382257-80da9fc34108?auto=format&fit=crop&q=80&w=800',
  'https://images.unsplash.com/photo-1600109919793-bb531dd5a363?auto=format&fit=crop&q=80&w=800',
  'https://images.unsplash.com/photo-1517059224940-d4af9eec41b7?auto=format&fit=crop&q=80&w=800',
  'https://images.unsplash.com/photo-1525547719571-a2d4ac8945e2?auto=format&fit=crop&q=80&w=800'
];

let demoIdCounter = 1;

function loadDemoData() {
  scans = [
    {
      id: demoIdCounter++,
      created_at: new Date(Date.now() - 5 * 60000).toISOString(),
      image_url: mockImages[0],
      objects_found: ['Person', 'Backpack']
    },
    {
      id: demoIdCounter++,
      created_at: new Date(Date.now() - 45 * 60000).toISOString(),
      image_url: mockImages[1],
      objects_found: ['Person', 'Laptop', 'Coffee Cup']
    },
    {
      id: demoIdCounter++,
      created_at: new Date(Date.now() - 120 * 60000).toISOString(),
      image_url: mockImages[2],
      objects_found: ['Cell Phone', 'Notebook']
    }
  ];
  
  if (scans.length > 0) updateLiveFeed(scans[0]);
  renderGrid();
}

function addMockScan() {
  const objectsPool = ['Person', 'Laptop', 'Cell Phone', 'Monitor', 'Keys', 'Backpack', 'Plant'];
  const numObjects = Math.floor(Math.random() * 3) + 1;
  const pickedObjects = [];
  for(let i=0; i<numObjects; i++) {
    pickedObjects.push(objectsPool[Math.floor(Math.random() * objectsPool.length)]);
  }
  
  const newScan = {
    id: demoIdCounter++,
    created_at: new Date().toISOString(),
    image_url: mockImages[Math.floor(Math.random() * mockImages.length)],
    objects_found: [...new Set(pickedObjects)]
  };
  
  scans.unshift(newScan);
  updateLiveFeed(newScan);
  
  // Real-time grid injection simulation
  if (!currentFilter || (newScan.objects_found || []).some(obj => obj.toLowerCase().includes(currentFilter))) {
    const card = createCardElement(newScan);
    gridEl.prepend(card);
    
    // Animate
    requestAnimationFrame(() => {
      setTimeout(() => {
        card.classList.add('card-enter-active');
      }, 10);
    });
    
    // Hide empty state if currently visible
    emptyStateEl.classList.add('hidden');
    emptyStateEl.classList.remove('flex');
    gridEl.classList.remove('hidden');
  }
  
  updateStats();
  updateQuickFilters();
}

// Boot up
document.addEventListener('DOMContentLoaded', init);
