# OpenClaw Engine — Daily Plan Spec

## Goal
Every day generate a **different**, **interactive**, **elegant** app project (Vite) that showcases **one or more** of these skill themes:

- **System** (filesystem/process/resource visualization, local info, simulated OS concepts)
- **Network** (request/latency visualization, WebSocket demo, packet-flow simulation, offline-first/cache)
- **AI** (on-device tiny model imitation, prompt playground, agent loop simulation, LLM UI patterns)
- **Game** (mechanics-driven visualizations, procedural generation, game loop simulation)

## Core Requirements

### 0. Mandatory Experience Thresholds (The "30-Second Rule")
- **Instant Utility / Demo Data**:
  - App MUST start with **Built-in Demo Data** loaded by default (or a prominent "Load Sample" button).
  - User must see a result/visualization immediately without manual data entry.
- **Simulation Mode**:
  - Since no external APIs are used, you MUST implement a `SimulationEngine` that generates realistic responses/latency.
  - Never show empty states or "Connect API" errors by default.
- **Tangible Output**:
  - A "Copy Result" or "Export" button must be visible on the first screen.
  - The app must produce something the user can take away (text, image, JSON).

### 1. Localization & Language Consistency
- **Full-Stack Localization**: All generated content must strictly use the language specified in the prompt. Ensure consistency across:
  - All UI elements (labels, menus, headers, tooltips, and messages).
  - All mock data, simulation content, and console logs.
  - The HUD scenario description.
- **Character Support**: Ensure the chosen font stack and encoding support the target language characters (e.g., CJK) gracefully on all platforms.
- **README.md**: The user-facing documentation (Overview, Features, Use Case) must be in the specified language, while technical comments in the code may remain in English.

### 2. Robustness & Self-Healing
- **Error Boundaries**: Must include a runtime error boundary (React/Vue) or global `window.onerror` / `unhandledrejection` handler with user-friendly fallback UI.
- **Retry Logic**: Use exponential backoff for any network requests (max 3 retries, 1s → 2s → 4s delays).
- **Memory Protection**: 
  - Clean up event listeners on unmount
  - Cancel ongoing animations/timers when navigating away
  - Implement weak references for large data structures when possible
- **Graceful Degradation**: If a feature fails (e.g., WebGL unavailable), fall back to Canvas 2D or DOM rendering with a notice.
- **Validation**: Validate all user inputs; sanitize before rendering to prevent XSS.
- **State Recovery**: Persist critical state to localStorage; offer "Continue where you left off" on reload.

### 2. Adaptive Rendering & Responsive Design

#### Device & Input Adaptation
- **Multi-Input**: Support both touch (tap/drag/pinch/rotate) and pointer (mouse/keyboard/trackpad).
  - **Drag & Drop Safety**: DO NOT use `setPointerCapture` on draggable source elements, as it prevents drop zones from receiving events. Always use global `pointerup` and `Escape` key listeners for state cleanup.
  - Touch targets: minimum 44x44px (iOS HIG) or 48x48px (Material)
  - Hover states only for pointer devices (use `@media (hover: hover)`)
  - Keyboard navigation: all interactive elements must be focusable with visible focus indicators
- **Viewport Responsiveness**:
  - Listen to `resize` and `orientationchange` events (debounced)
  - Test breakpoints: 320px (mobile S), 375px (mobile M), 768px (tablet), 1024px (desktop), 1920px (large desktop)
  - Use CSS Container Queries where appropriate for component-level responsiveness
- **Safe Area Support**: 
  - Apply `env(safe-area-inset-*)` to padding/margins
  - Test on notched devices (iPhone), foldables, and tablets with system UI
- **High DPR**: Support devicePixelRatio 1x, 2x, 3x for canvas/images (use `window.devicePixelRatio`)

#### Performance Self-Tuning
- **Adaptive Quality**:
  - Detect device performance tier (use `navigator.hardwareConcurrency`, simple benchmark on load)
  - Low-end devices (<4 cores): reduce particle count, lower animation FPS, disable shadows
  - High-end devices (≥8 cores): enable advanced effects, higher resolution
- **Frame Budget**: Target 60fps (16.67ms/frame). If consistently dropping below 45fps, auto-reduce quality.
- **Lazy Loading**: Defer non-critical resources; use intersection observer for below-the-fold content.
- **Code Splitting**: Split large dependencies (e.g., chart libraries) into separate chunks loaded on-demand.

#### Visual Adaptation
- **Dark Mode**: Respect `prefers-color-scheme: dark`. Provide seamless theme switching with CSS variables.
- **Reduced Motion**: Honor `prefers-reduced-motion: reduce` by disabling or simplifying animations.
- **High Contrast**: Test with `prefers-contrast: high`; ensure sufficient color contrast (WCAG AA: 4.5:1 for text).
- **Font Scaling**: Support dynamic font sizes; test with browser zoom at 150%, 200%.

### 3. Application Scenario (Practicality)

Each daily project must clearly state at least one real-world application scenario (who uses it, for what decision/workflow, and what output it produces).

#### Documentation Requirements
- **HUD Scenario**: One concise sentence visible in the app's header or info panel
  - Format: "[User persona] uses this to [action/decision] and gets [output]"
  - Example: "Developers use this to visualize API latency patterns and identify bottlenecks"
- **README.md**: Include a "Use Case" section with:
  - Problem statement (2-3 sentences)
  - How this tool solves it
  - Sample workflow (step-by-step)
  - Example output (screenshot or description)

#### Practical Features (Choose at least 2)
- **Export Capability**: 
  - PNG/SVG for visualizations (use `html2canvas` or native canvas export)
  - JSON/CSV for data tables
  - Copy to clipboard functionality
  - Share URL with encoded state (base64 query params)
- **Persistence**: 
  - Save/load presets to localStorage
  - Import/export config as JSON file
  - "Continue where you left off" on page reload
- **Customization**:
  - User-adjustable parameters (sliders, color pickers, dropdowns)
  - Preset library (e.g., "Low Motion", "High Contrast", "Dense View")
  - Keyboard shortcuts for power users
- **Real-time Feedback**:
  - Live preview as settings change
  - Performance metrics visible (FPS counter, memory usage)
  - Undo/redo stack for destructive actions

### 4. Technical Baseline
- **Build**: Vite + (React/Vue/Vanilla/Solid/Svelte)
- **Styling**: If using Tailwind CSS, you MUST include `tailwind.config.js` and `postcss.config.js` in the output to ensure utility classes are processed correctly.
- **Deployment**: Use `vite build --base ./` so it can be served from any subdirectory
- **Static Assets**: Root `index.html` should be rendered/processed by Vite; do not rely on raw `fetch` for local files in a way that breaks on file:// or strict static servers
- **Manifest**: Update `manifest.json` with current project metadata (title, description, date, tags, theme categories)
- **Dependencies**: Document all major dependencies in README with version and purpose

## Testing & Validation Checklist

### Pre-Build Verification
- [ ] `npm install` completes without errors
- [ ] `npm run dev` starts and app loads at localhost
- [ ] No console errors/warnings in development mode
- [ ] TypeScript/ESLint checks pass (if applicable)

### Cross-Browser Testing (spot-check at least 2)
- [ ] Chrome/Edge (latest)
- [ ] Safari (macOS/iOS)
- [ ] Firefox (latest)

### Device Testing
- [ ] Desktop (1920x1080, 1440x900)
- [ ] Tablet (768x1024, both orientations)
- [ ] Mobile (375x667 iPhone, 360x640 Android)
- [ ] Test with browser DevTools device emulation + touch events

### Interaction Verification
- [ ] All buttons/links are clickable and provide feedback
- [ ] Touch gestures work on mobile (tap, drag, pinch if applicable)
- [ ] Keyboard navigation is functional (Tab, Enter, Escape, Arrows)
- [ ] Forms validate inputs and show clear error messages
- [ ] Loading states appear for async operations

### Performance & Resource Checks
- [ ] Initial load < 3s on Fast 3G (Chrome DevTools Network throttling)
- [ ] No memory leaks after 2 minutes of usage (check DevTools Memory profiler)
- [ ] Animations run at 60fps (check Performance tab)
- [ ] Bundle size is under budget (check build output)

### Accessibility (A11y) Audit
- [ ] Run Lighthouse accessibility audit (score ≥ 90)
- [ ] Tab through entire app without getting stuck
- [ ] Color contrast meets WCAG AA standards
- [ ] All images have alt text (or `aria-hidden` if decorative)
- [ ] Screen reader announces meaningful content (test with VoiceOver or NVDA)

### Edge Cases & Error Handling
- [ ] Handles network offline/online transitions gracefully
- [ ] Recovers from simulated errors (throw error in console)
- [ ] Works with ad blockers enabled
- [ ] No critical errors when window is resized aggressively
- [ ] LocalStorage quota exceeded is handled (try/catch with fallback)

### Final Build Check
- [ ] `npm run build` succeeds with no errors
- [ ] Build output in `dist/` folder
- [ ] Built app works when opened via local static server (e.g., `python -m http.server`)
- [ ] All assets load correctly (check Network tab for 404s)
- [ ] Manifest file is updated with correct metadata
- [ ] README.md is complete with use case, features, and controls

## Continuous Improvement Principles

### Learn from Past Projects
- Review previous projects monthly to identify patterns (what worked, what didn't)
- Track user feedback themes (via Hub feedback modal)
- Build a reusable component library from best patterns

### Innovation Goals
- Try at least one new technique/library per project
- Experiment with emerging web APIs (View Transitions API, Web Animations, Scroll Timeline, etc.)
- Balance novelty with stability (don't use alpha/experimental libraries for core functionality)

### Quality Over Quantity
- A polished, delightful experience is better than feature bloat
- Prioritize core interaction; cut scope if needed to maintain quality
- Every project should feel complete, not rushed


## Tech Stack & Styling (Stability Focused)

### CSS Frameworks & Styling
- **Tailwind CSS** (Preferred for speed and consistency)
- **CSS Modules** (For isolated component styles)
- **Standard CSS** (Variable-based, modern layouts)

### UI Framework
- **React 18+** (Standard Hooks, Context, Suspsense)
- **Vite** (Standard build tool)

### Animation & Interaction Libraries

### Animation & Interaction Libraries
Add motion and delight, vary the tooling:
  - **Framer Motion** (declarative animations for React)
  - **GSAP** (timeline-based, high-performance)
  - **Motion One** (lightweight Web Animations API wrapper)
  - **Auto Animate** (zero-config transitions)
  - **Native CSS Animations** (keyframes, transitions, view-timeline)

### Data Visualization (when applicable)
  - **D3.js** (full control, custom charts)
  - **Chart.js** (simple, quick)
  - **Recharts** / **Victory** (React-friendly)
  - **Canvas API** (custom particle systems, generative art)
  - **Three.js** / **WebGL** (3D visualizations)

### Design Languages
Experiment with different visual aesthetics:
  - **Glassmorphism** (frosted glass effects, backdrop-blur)
  - **Neumorphism** (soft shadows, embossed)
  - **Flat 3.0** (vibrant, bold colors, geometric)
  - **Apple-style Minimal** (spacious, subtle gradients, SF-like typography)
  - **Brutalism** (raw, asymmetric, high contrast)
  - **Retro / Synthwave** (gradient meshes, neon, 80s inspired)

## Design Constraints

### Visual Polish & UX Excellence
- **HUD Design**: 
  - Minimal, auto-fading HUD (fade after 3s of inactivity, reappear on interaction)
  - Semi-transparent background with backdrop-filter for depth
  - Clear visual hierarchy (primary actions prominent, secondary subtle)
- **Color Palette**: 
  - Cohesive scheme with 3-5 core colors
  - Use semantic colors (success, warning, error, info)
  - Ensure 4.5:1 contrast for text, 3:1 for UI components
- **Transitions & Animations**:
  - Smooth, purposeful animations (avoid unnecessary decoration)
  - Duration: 150-300ms for micro-interactions, 300-600ms for scene transitions
  - Easing: use natural curves (ease-out for entrances, ease-in for exits)
  - Spring physics for draggable elements (overshoot, bounce-back)
- **Loading States**: 
  - Never show blank screens; use skeletons, spinners, or progress indicators
  - Optimistic UI: show expected result immediately, reconcile on response
- **Empty States**: Provide helpful guidance when no data exists (not just "No results")
- **Micro-interactions**: Add delight with subtle feedback (button press ripple, success confetti, haptic feedback on mobile)

### Accessibility (A11y)
- **Semantic HTML**: Use proper tags (`<button>`, `<nav>`, `<main>`, `<aside>`)
- **ARIA Labels**: Provide `aria-label` for icon-only buttons, `aria-live` for dynamic updates
- **Keyboard Navigation**: 
  - Tab order is logical
  - Escape key closes modals/dialogs
  - Arrow keys for slider/carousel navigation
- **Screen Reader Support**: Test with VoiceOver (macOS/iOS) or NVDA (Windows)
- **Focus Management**: Trap focus in modals, restore focus after dialog closes

### Code Quality Standards
- **TypeScript**: Use strict mode; avoid `any` (use `unknown` for truly dynamic data)
- **Naming**: Clear, descriptive variable/function names (prefer `handleButtonClick` over `onClick`)
- **Component Size**: Keep components under 250 lines; split complex logic into hooks/composables
- **Pure Functions**: Prefer pure functions for business logic (easier to test, no side effects)
- **Comments**: Only when "why", not "what" (code should be self-documenting)
- **Magic Numbers**: Extract to named constants (e.g., `const MAX_PARTICLES = 500`)

### Performance Budget
- **Bundle Size**: 
  - Initial JS: < 200KB (gzipped)
  - Total JS: < 500KB (gzipped, including lazy chunks)
  - CSS: < 50KB (gzipped)
- **Metrics**:
  - First Contentful Paint (FCP): < 1.5s
  - Largest Contentful Paint (LCP): < 2.5s
  - Cumulative Layout Shift (CLS): < 0.1
  - Time to Interactive (TTI): < 3.5s
- **Optimization Techniques**:
  - Tree-shake unused code
  - Use dynamic imports for heavy dependencies
  - Compress assets (use WebP/AVIF for images)
  - Preload critical resources (`<link rel="preload">`)
  - Avoid layout thrashing (batch DOM reads, then writes)
