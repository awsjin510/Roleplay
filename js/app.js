import { industries, personas, situations, difficulties } from './data.js';
import { SpinnerWheel } from './spinner.js';

// Initialize wheels
const wheels = {
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
  )
};

// Result elements
const resultEls = {
  industry: document.getElementById('result-industry'),
  persona: document.getElementById('result-persona'),
  situation: document.getElementById('result-situation'),
  difficulty: document.getElementById('result-difficulty')
};

// Update result display on wheel change
document.addEventListener('wheel-change', (e) => {
  const { value, label } = e.detail;
  if (resultEls[label]) {
    resultEls[label].textContent = value;
  }
});

// Spin All button
document.getElementById('spin-all').addEventListener('click', async () => {
  const keys = ['industry', 'persona', 'situation', 'difficulty'];
  const delays = [0, 200, 400, 600];

  keys.forEach((key, i) => {
    setTimeout(() => {
      wheels[key].spin();
    }, delays[i]);
  });
});

// Individual spin buttons
document.querySelectorAll('.spin-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const key = btn.dataset.wheel;
    if (wheels[key]) {
      wheels[key].spin();
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
});

// Set initial results
Object.keys(wheels).forEach(key => {
  resultEls[key].textContent = wheels[key].getSelected();
});
