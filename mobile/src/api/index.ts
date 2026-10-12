/* BUILT v2 client API: one import for every table and Edge Function the
   app uses. docs/API.md documents each call, its errors and what it does
   without an account.

     import { getProfile, saveProfilePatch, generatePlan, ApiError } from '../src/api';

   Device modules (camera blur, face detection, health apps) are separate
   imports so their native code only loads where it is used:

     import { bakeBlur } from '../src/api/device/blur';
     import { detectFaces } from '../src/api/device/faces';
     import { healthPlatform } from '../src/api/device/health';

   Every function throws ApiError (code + a message safe to show). */

export { ApiError, asApiError, MESSAGES } from './errors';
export { invoke, requireAccount } from './client';

export * from './profile';
export * from './plan';
export * from './food';
export * from './activities';
export * from './checkins';
export * from './memory';
export * from './coach';
export * from './photos';
export * from './reports';
export * from './push';
export * from './health';
export * as rules from './rules';
