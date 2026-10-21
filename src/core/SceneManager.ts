import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type TapCallback = (intersect: THREE.Intersection, event: PointerEvent) => void;

export class SceneManager {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public controls: OrbitControls;
  public rootGroup: THREE.Group;

  private container: HTMLElement;
  private resizeObserver: ResizeObserver;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private pointerDownPos = { x: 0, y: 0 };
  private tapCallbacks: TapCallback[] = [];
  private frameCallbacks: ((dt: number, elapsed: number) => void)[] = [];
  private clock = new THREE.Clock();
  private animId = 0;
  private gridHelper: THREE.GridHelper;

  constructor(container: HTMLElement) {
    this.container = container;
    this.scene = new THREE.Scene();

    const width = Math.max(container.clientWidth, 280);
    const height = Math.max(container.clientHeight, 220);

    this.camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 200);
    this.camera.position.set(4.8, 5.6, 6.2);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.localClippingEnabled = true;

    container.innerHTML = '';
    container.appendChild(this.renderer.domElement);

    // 照明
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.86);
    this.scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.72);
    dirLight1.position.set(8, 14, 10);
    this.scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xeef3ee, 0.35);
    dirLight2.position.set(-8, -6, -6);
    this.scene.add(dirLight2);

    // 3D空間の基準方眼グリッド
    this.gridHelper = new THREE.GridHelper(10, 10, 0x6aa893, 0xc5ddd3);
    this.gridHelper.position.y = -0.02;
    this.scene.add(this.gridHelper);

    this.rootGroup = new THREE.Group();
    this.scene.add(this.rootGroup);

    // OrbitControls (1本指回転・2本指ピンチズーム)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = 2.4;
    this.controls.maxDistance = 18;
    this.controls.maxPolarAngle = Math.PI * 0.88;
    this.controls.target.set(0, 0.4, 0);
    this.controls.update();

    // タップ判定（ドラッグ回転と区別）
    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', this.onPointerDown);
    dom.addEventListener('pointerup', this.onPointerUp);

    // ResizeObserver でスマホ回転やマルチデバイス幅変更に即座追従
    this.resizeObserver = new ResizeObserver(() => {
      this.handleResize();
    });
    this.resizeObserver.observe(this.container);

    this.startLoop();
  }

  public setGridVisible(visible: boolean): void {
    this.gridHelper.visible = visible;
  }

  public clearRoot(): void {
    while (this.rootGroup.children.length > 0) {
      const child = this.rootGroup.children[0];
      this.rootGroup.remove(child);
    }
    this.tapCallbacks = [];
    this.frameCallbacks = [];
  }

  public onTap(cb: TapCallback): void {
    this.tapCallbacks.push(cb);
  }

  public onFrame(cb: (dt: number, elapsed: number) => void): void {
    this.frameCallbacks.push(cb);
  }

  public resetCamera(pos: [number, number, number] = [4.6, 5.4, 6.0], target: [number, number, number] = [0, 0.4, 0]): void {
    this.camera.position.set(pos[0], pos[1], pos[2]);
    this.controls.target.set(target[0], target[1], target[2]);
    this.controls.update();
  }

  public setTopView(): void {
    this.camera.position.set(0, 9.2, 0.01);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.pointerDownPos = { x: e.clientX, y: e.clientY };
  };

  private onPointerUp = (e: PointerEvent): void => {
    const dx = e.clientX - this.pointerDownPos.x;
    const dy = e.clientY - this.pointerDownPos.y;
    if (Math.hypot(dx, dy) > 9) return; // スワイプ回転だった場合はタップ発火しない

    if (this.tapCallbacks.length === 0) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersects = this.raycaster.intersectObjects(this.rootGroup.children, true);
    if (intersects.length > 0) {
      for (const cb of this.tapCallbacks) {
        cb(intersects[0], e);
      }
    }
  };

  public handleResize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w <= 0 || h <= 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private startLoop(): void {
    const tick = () => {
      this.animId = requestAnimationFrame(tick);
      const dt = this.clock.getDelta();
      const elapsed = this.clock.getElapsedTime();
      this.controls.update();
      for (const cb of this.frameCallbacks) {
        cb(dt, elapsed);
      }
      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }

  public dispose(): void {
    cancelAnimationFrame(this.animId);
    this.resizeObserver.disconnect();
    const dom = this.renderer.domElement;
    dom.removeEventListener('pointerdown', this.onPointerDown);
    dom.removeEventListener('pointerup', this.onPointerUp);
    this.controls.dispose();
    this.renderer.dispose();
  }
}
