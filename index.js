import { NativeModules, Platform } from 'react-native';

const { BisetkaPhotosphere } = NativeModules;

class Photosphere {
  async stitch(images) {
    if (Platform.OS !== 'android') {
      throw new Error('Stitching only supported on Android');
    }

    return await BisetkaPhotosphere.stitchImages(images);
  }
}

export default new Photosphere();
