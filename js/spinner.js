const ITEM_HEIGHT = 48;
const VISIBLE_ITEMS = 5;
const VIEWPORT_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;
const REPEATS = 3;

export class SpinnerWheel {
  constructor(containerEl, options, label) {
    this.containerEl = containerEl;
    this.options = options;
    this.label = label;
    this.selectedIndex = 0;
    this.spinning = false;

    this.strip = containerEl.querySelector('.wheel-strip');
    this.viewport = containerEl.querySelector('.wheel-viewport');

    this._buildItems();
    this._setPositionToIndex(0, false);

    // Click to select
    this.strip.addEventListener('click', (e) => {
      if (this.spinning) return;
      const item = e.target.closest('.wheel-item');
      if (!item) return;
      const idx = parseInt(item.dataset.index, 10);
      if (!isNaN(idx)) {
        this.selectedIndex = idx;
        this._setPositionToIndex(idx, true);
        this._dispatchChange();
      }
    });
  }

  _buildItems() {
    this.strip.innerHTML = '';
    const total = this.options.length;

    for (let r = 0; r < REPEATS; r++) {
      for (let i = 0; i < total; i++) {
        const div = document.createElement('div');
        div.className = 'wheel-item';
        div.textContent = this.options[i];
        div.dataset.index = i;
        this.strip.appendChild(div);
      }
    }
  }

  _setPositionToIndex(index, animate) {
    const total = this.options.length;
    // Position to the middle repeat
    const middleOffset = total * ITEM_HEIGHT;
    const targetY = -(middleOffset + index * ITEM_HEIGHT) + (VIEWPORT_HEIGHT / 2 - ITEM_HEIGHT / 2);

    if (!animate) {
      this.strip.classList.add('no-transition');
    } else {
      this.strip.classList.remove('no-transition');
      this.strip.classList.remove('spinning');
    }

    this.strip.style.transform = `translateY(${targetY}px)`;

    if (!animate) {
      // Force reflow
      this.strip.offsetHeight;
      this.strip.classList.remove('no-transition');
    }

    this._updateSelected(index);
  }

  _updateSelected(index) {
    this.strip.querySelectorAll('.wheel-item').forEach(el => {
      el.classList.toggle('selected', parseInt(el.dataset.index, 10) === index);
    });
  }

  spin() {
    if (this.spinning) return Promise.resolve(this.getSelected());
    this.spinning = true;

    return new Promise((resolve) => {
      const total = this.options.length;
      const targetIndex = Math.floor(Math.random() * total);
      this.selectedIndex = targetIndex;

      // Calculate position: go through 1-2 full cycles + land on target
      const extraCycles = 1 + Math.floor(Math.random() * 2);
      const middleOffset = total * ITEM_HEIGHT;
      const spinDistance = extraCycles * total * ITEM_HEIGHT;
      const targetY = -(middleOffset + targetIndex * ITEM_HEIGHT + spinDistance) + (VIEWPORT_HEIGHT / 2 - ITEM_HEIGHT / 2);

      // Start spinning
      this.strip.classList.remove('no-transition');
      this.strip.classList.add('spinning');
      this.strip.style.transform = `translateY(${targetY}px)`;

      const onEnd = () => {
        this.strip.removeEventListener('transitionend', onEnd);
        this.spinning = false;

        // Snap to canonical position (middle repeat) without animation
        this._setPositionToIndex(targetIndex, false);
        this._dispatchChange();
        resolve(this.options[targetIndex]);

        // Landing flash on the pointer bar
        const pointer = this.containerEl.querySelector('.wheel-pointer');
        if (pointer) {
          pointer.classList.remove('landing');
          void pointer.offsetWidth; // reflow to restart animation
          pointer.classList.add('landing');
          pointer.addEventListener('animationend', () => pointer.classList.remove('landing'), { once: true });
        }
      };

      this.strip.addEventListener('transitionend', onEnd);
    });
  }

  step(dir) {
    if (this.spinning) return;
    const total = this.options.length;
    this.selectedIndex = ((this.selectedIndex + dir) % total + total) % total;
    this._setPositionToIndex(this.selectedIndex, true);
    this._dispatchChange();
  }

  getSelected() {
    return this.options[this.selectedIndex];
  }

  reset() {
    this.selectedIndex = 0;
    this._setPositionToIndex(0, false);
    this._dispatchChange();
  }

  _dispatchChange() {
    this.containerEl.dispatchEvent(new CustomEvent('wheel-change', {
      detail: { value: this.getSelected(), label: this.label },
      bubbles: true
    }));
  }
}
