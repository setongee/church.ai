import { Router } from 'express';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import { getLibrary } from '../controllers/reelLibrary.controller.js';
import { createCustomReel, deleteCustomReel } from '../controllers/customReel.controller.js';
import { audioUpload, outroMediaUpload, customReelUpload } from '../middlewares/upload.js';
import {
  importAudioSession,
  listReels,
  generateReels,
  updateReel,
  renderReelEndpoint,
  renderAllReels,
  deleteReel,
  applyTemplateToAll,
  publishReelToInstagram,
  createFullReel,
} from '../controllers/reel.controller.js';
import {
  getAudioInfo,
  getWords,
  editWords,
  replaceWords,
  getPeaks,
  detectSectionsEndpoint,
  saveSections,
} from '../controllers/transcriptEdit.controller.js';
import {
  listCompilations,
  generateCompilation,
  updateCompilation,
  renderCompilationEndpoint,
  deleteCompilation,
  publishCompilationToInstagram,
} from '../controllers/compilation.controller.js';
import {
  getTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  previewTemplate,
  outroPreviews,
  uploadOutroMedia,
} from '../controllers/reelTemplate.controller.js';

import { audioPreview } from '../controllers/audioPreview.controller.js';
import {
  getPhotoTemplates,
  listPhotoReels,
  createPhotoReel,
  updatePhotoReel,
  deletePhotoReel,
  addPhotos,
  removePhoto,
  renderPhotoReelEndpoint,
  previewPhotoReel,
  templatePreviews,
  publishPhotoReelToInstagram,
  generateCarousel,
  saveCarousel,
  renderCarouselEndpoint,
  enhancePhotoEndpoint,
  revertPhotoEndpoint,
} from '../controllers/photoReel.controller.js';
import { memoryUpload } from '../middlewares/upload.js';
import { getTracks, uploadTrack, removeTrack } from '../controllers/music.controller.js';

// Mounted at /api. Session-scoped routes live alongside the session/service ones they extend.
const router = Router();

router.post('/services/:id/import-audio', audioUpload.single('audio'), h(importAudioSession));

// Reels
router.get('/sessions/:id/reels', h(listReels));
router.post('/sessions/:id/reels/generate', h(generateReels));
router.post('/sessions/:id/reels/render-all', h(renderAllReels));
router.post('/sessions/:id/reels/full', h(createFullReel));
router.post('/sessions/:id/reels/apply-template', h(applyTemplateToAll));
router.patch('/reels/:id', h(updateReel));
router.post('/reels/:id/render', h(renderReelEndpoint));
router.delete('/reels/:id', h(deleteReel));
router.post('/reels/:id/publish-instagram', h(publishReelToInstagram));

// Timeline: word-level transcript editing, waveform, service sections
router.get('/sessions/:id/audio-info', h(getAudioInfo));
router.get('/sessions/:id/transcript-words', h(getWords));
router.patch('/sessions/:id/transcript-words', h(editWords));
router.post('/sessions/:id/transcript-words/replace', h(replaceWords));
router.get('/sessions/:id/peaks', h(getPeaks));
router.post('/sessions/:id/sections/detect', h(detectSectionsEndpoint));
router.put('/sessions/:id/sections', h(saveSections));

// Merged reels
router.get('/sessions/:id/compilations', h(listCompilations));
router.post('/sessions/:id/compilations/generate', h(generateCompilation));
router.patch('/compilations/:id', h(updateCompilation));
router.post('/compilations/:id/render', h(renderCompilationEndpoint));
router.delete('/compilations/:id', h(deleteCompilation));
router.post('/compilations/:id/publish-instagram', h(publishCompilationToInstagram));

// Templates
router.get('/reel-templates', h(getTemplates));
router.post('/reel-templates', h(createTemplate));
router.post('/reel-templates/preview', h(previewTemplate));
router.get('/reel-library', h(getLibrary));
router.post('/outro-previews', h(outroPreviews));
router.post('/outro-media', outroMediaUpload.single('media'), h(uploadOutroMedia));
router.patch('/reel-templates/:id', h(updateTemplate));
router.delete('/reel-templates/:id', h(deleteTemplate));

// Custom-template reels (rendered in the browser, uploaded when done)
router.post('/custom-reels', customReelUpload.single('video'), h(createCustomReel));
router.delete('/custom-reels/:id', h(deleteCustomReel));

// Photo reels + carousels
router.get('/photo-templates', h(getPhotoTemplates));
router.get('/photo-reels', h(listPhotoReels));
router.post('/photo-reels', h(createPhotoReel));
router.patch('/photo-reels/:id', h(updatePhotoReel));
router.delete('/photo-reels/:id', h(deletePhotoReel));
router.post('/photo-reels/:id/photos', memoryUpload.array('photos', 30), h(addPhotos));
router.delete('/photo-reels/:id/photos/:imageId', h(removePhoto));
router.post('/photo-reels/:id/photos/:imageId/enhance', h(enhancePhotoEndpoint));
router.post('/photo-reels/:id/photos/:imageId/revert', h(revertPhotoEndpoint));
router.post('/photo-reels/:id/render', h(renderPhotoReelEndpoint));
router.post('/photo-reels/:id/preview', h(previewPhotoReel));
router.post('/photo-reels/:id/template-previews', h(templatePreviews));
router.post('/photo-reels/:id/publish-instagram', h(publishPhotoReelToInstagram));
router.post('/photo-reels/:id/carousel/generate', h(generateCarousel));
router.put('/photo-reels/:id/carousel', h(saveCarousel));
router.post('/photo-reels/:id/carousel/render', h(renderCarouselEndpoint));

// Background music
router.post('/audio-preview', h(audioPreview));
router.get('/music', h(getTracks));
router.post('/music', audioUpload.single('audio'), h(uploadTrack));
router.delete('/music/:id', h(removeTrack));

export default router;
