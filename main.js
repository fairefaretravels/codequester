// Import Three.js (if using modules, otherwise ensure THREE is globally available)

// Scene setup
function createScene() {
  const scene = new THREE.Scene();
  return scene;
}

// Camera setup
function createCamera() {
  const aspect = window.innerWidth / window.innerHeight;
  const camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
  camera.position.z = 5;
  return camera;
}

// Renderer setup
function createRenderer() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);
  return renderer;
}

// Create cube (choose wireframe or solid)
function createCube({ wireframe = true, color = 0x00ffcc } = {}) {
  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshBasicMaterial({ color, wireframe });
  return new THREE.Mesh(geometry, material);
}

// Responsive resize handler
function handleResize(camera, renderer) {
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

// Main
(function main() {
  const scene = createScene();
  const camera = createCamera();
  const renderer = createRenderer();

  // Toggle wireframe or solid in the call below
  const cube = createCube({ wireframe: true, color: 0x00ffcc }); // cyan wireframe
  scene.add(cube);

  handleResize(camera, renderer);

  // Animation loop
  function animate() {
    requestAnimationFrame(animate);
    cube.rotation.x += 0.01;
    cube.rotation.y += 0.01;
    renderer.render(scene, camera);
  }

  animate();
})();
