module.exports = {
  dependency: {
    platforms: {
      ios: {
        podspecPath: './react-native-bisetka-photosphere.podspec',
      },
      android: {
        sourceDir: './android',
        packageImportPath:
          'import com.bisetkaphotosphere.turbomodule.PhotospherePackage;',
        packageInstance: 'new PhotospherePackage()',
      },
    },
  },
};
