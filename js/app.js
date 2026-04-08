import { salespersons, products, industries, personas, situations, difficulties, cloudEnvironments } from './data.js';
import { SpinnerWheel } from './spinner.js';

// Initialize wheels
const wheels = {
  salesperson: new SpinnerWheel(
    document.querySelector('#wheel-salesperson .wheel-container'),
    salespersons,
    'salesperson'
  ),
  product: new SpinnerWheel(
    document.querySelector('#wheel-product .wheel-container'),
    products,
    'product'
  ),
  industry: new SpinnerWheel(
    document.querySelector('#wheel-industry .wheel-container'),
    industries,
    'industry'
  ),
  persona: new SpinnerWheel(
    document.querySelector('#wheel-persona .wheel-container'),
    personas,
    'persona'
  ),
  situation: new SpinnerWheel(
    document.querySelector('#wheel-situation .wheel-container'),
    situations,
    'situation'
  ),
  difficulty: new SpinnerWheel(
    document.querySelector('#wheel-difficulty .wheel-container'),
    difficulties,
    'difficulty'
  ),
  'cloud-env': new SpinnerWheel(
    document.querySelector('#wheel-cloud-env .wheel-container'),
    cloudEnvironments,
    'cloud-env'
  ),
};

// Result elements
const resultEls = {
  salesperson: document.getElementById('result-salesperson'),
  product: document.getElementById('result-product'),
  industry: document.getElementById('result-industry'),
  persona: document.getElementById('result-persona'),
  situation: document.getElementById('result-situation'),
  difficulty: document.getElementById('result-difficulty'),
  'cloud-env': document.getElementById('result-cloud-env'),
};

const cloudEnvSection = document.getElementById('cloud-env-section');
const cloudEnvResultItem = document.getElementById('result-item-cloud-env');

function isCloudProduct() {
  return wheels.product.getSelected() === '雲端服務';
}

function updateCloudEnvVisibility() {
  const show = isCloudProduct();
  if (show) {
    cloudEnvSection.style.display = 'block';
    cloudEnvSection.classList.add('cloud-env-animate');
    cloudEnvResultItem.style.display = 'flex';
  } else {
    cloudEnvSection.style.display = 'none';
    cloudEnvSection.classList.remove('cloud-env-animate');
    cloudEnvResultItem.style.display = 'none';
    resultEls['cloud-env'].textContent = '—';
  }
}

// Update result display on wheel change
document.addEventListener('wheel-change', (e) => {
  const { value, label } = e.detail;
  if (resultEls[label]) {
    resultEls[label].textContent = value;
  }
  if (label === 'product') {
    updateCloudEnvVisibility();
  }
});

// Spin All button
document.getElementById('spin-all').addEventListener('click', async () => {
  const baseKeys = ['salesperson', 'product', 'industry', 'persona', 'situation', 'difficulty'];
  const delays = [0, 150, 300, 450, 600, 750];

  baseKeys.forEach((key, i) => {
    setTimeout(() => {
      wheels[key].spin().then(() => {
        if (key === 'product') {
          updateCloudEnvVisibility();
          if (isCloudProduct()) {
            setTimeout(() => wheels['cloud-env'].spin(), 200);
          }
        }
      });
    }, delays[i]);
  });
});

// Nav buttons (▲▼)
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const key = btn.dataset.wheel;
    const dir = parseInt(btn.dataset.dir, 10);
    if (wheels[key]) wheels[key].step(dir);
  });
});

// Individual spin buttons
document.querySelectorAll('.spin-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const key = btn.dataset.wheel;
    if (wheels[key]) {
      wheels[key].spin().then(() => {
        if (key === 'product') {
          updateCloudEnvVisibility();
          if (isCloudProduct()) {
            setTimeout(() => wheels['cloud-env'].spin(), 200);
          }
        }
      });
    }
  });
});

// Reset button
document.getElementById('reset-all').addEventListener('click', () => {
  Object.keys(wheels).forEach(key => {
    wheels[key].reset();
  });
  Object.values(resultEls).forEach(el => {
    el.textContent = '—';
  });
  updateCloudEnvVisibility();
});

// Set initial results
Object.keys(wheels).forEach(key => {
  resultEls[key].textContent = wheels[key].getSelected();
});
updateCloudEnvVisibility();
