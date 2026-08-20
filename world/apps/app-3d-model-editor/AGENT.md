# Model Studio

- Published `/` through `index.html` in `node.json`.
- Built a local 3D editing slice with scene selection, transform editing, material controls, viewport modes, timeline playback, save/export, undo/redo, and persisted scene state.
- Viewport orbit and zoom are implemented with pointer drag and wheel input; orbit/zoom persist with the scene.
- Viewport drags on the selected mesh now move its X/Z position and refresh the inspector coordinates; empty viewport drags still orbit.
