// The animation effects offered for "Animate this design". Plain JS, shared by the backend (to
// validate) and the Remotion bundle (to draw).
export const DESIGN_EFFECTS = [
  { id: 'rise', label: 'Reveal up', hint: 'Each element slides up out of a mask.' },
  { id: 'fade', label: 'Fade in', hint: 'A soft fade.' },
  { id: 'blur', label: 'Blur in', hint: 'Comes into focus.' },
  { id: 'zoomin', label: 'Zoom in', hint: 'Grows from small to full size.' },
  { id: 'zoomout', label: 'Settle down', hint: 'Starts large and settles into place.' },
  { id: 'slideleft', label: 'Slide from right', hint: 'Glides in from the right edge.' },
  { id: 'slideright', label: 'Slide from left', hint: 'Glides in from the left edge.' },
  { id: 'dropdown', label: 'Drop in', hint: 'Falls in from above.' },
  { id: 'pop', label: 'Pop', hint: 'A springy overshoot.' },
  { id: 'wipe', label: 'Wipe', hint: 'Revealed left to right, like being written.' },
  { id: 'tilt', label: 'Tilt in', hint: 'Swings in from a slight rotation.' },
  { id: 'flip', label: 'Flip up', hint: 'Folds up from the baseline.' },
];

export const MAX_DESIGN_ANIM_SEC = 8;
