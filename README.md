# AURA – Ambulance Utilization & Routing Assistant
### Emergency Operations Research Dispatcher

AURA is a single-page emergency dispatch operations research application connecting a React + Tailwind frontend to a FastAPI backend. It solves real-time ambulance assignment and routing problems using:
1. **PuLP Mixed Integer Linear Programming (MILP)**: Minimizes priority-weighted travel times $\min \sum w_j \cdot t_{ij} \cdot x_{ij}$.
2. **Kuhn-Munkres (Hungarian) Algorithm**: Exact bipartite matching cross-validation via SciPy (`linear_sum_assignment`).
3. **Dijkstra's Algorithm**: Exact all-pairs shortest road distance computation across City Zones A through F.

---

## Project Structure

```
├── backend/
│   ├── main.py              # FastAPI app with PuLP, SciPy, NetworkX
│   ├── requirements.txt     # Python dependencies
│   └── README.md            # Backend instructions
├── src/
│   ├── components/
│   │   ├── Header.tsx           # Brand bar, API endpoint config, theme toggle
│   │   ├── Tabs.tsx             # 6-module navigation tabs
│   │   ├── ErrorBanner.tsx      # Connection diagnostics & simulation fallback
│   │   ├── DashboardView.tsx    # 5 KPI cards, quick optimization, split-screen
│   │   ├── AmbulancesView.tsx   # Fleet table, BLS/ALS capabilities, status toggle
│   │   ├── EmergenciesView.tsx  # Triage logging, priority weights (w=1..5)
│   │   ├── OptimizationView.tsx # PuLP MILP solver, Hungarian cross-check, queue
│   │   ├── RoutingView.tsx      # Dijkstra shortest path, SVG road network map
│   │   └── AnalyticsView.tsx    # Baseline vs Optimized comparative benchmarks
│   ├── services/
│   │   ├── api.ts               # REST API client & prototype simulator
│   │   └── graph.ts             # City zone graph & Dijkstra solver
│   ├── types/
│   │   └── index.ts             # TypeScript interfaces
│   ├── App.tsx                  # Main application container
│   ├── index.css                # Tailwind CSS v4 styling
│   └── main.tsx                 # React DOM root entry
├── index.html                   # HTML template
├── package.json                 # Node dependencies & build scripts
├── tsconfig.json                # TypeScript configuration
└── vite.config.ts               # Vite configuration
```

---

## Getting Started

### 1. Run Backend (FastAPI on Port 8000)
```bash
cd backend
python -m venv venv
source venv/bin/activate    # On Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 2. Run Frontend (React Vite on Port 3000)
```bash
npm install
npm run dev
```
Open `http://localhost:3000` in your browser.
