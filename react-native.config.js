module.exports = {
  dependency: {
    platforms: {
      ios: {
        podspecPath: './capture360.podspec',
      },
      android: {
        sourceDir: './android',
        packageImportPath:
          'import com.capture360.turbomodule.Capture360Package;',
        packageInstance: 'new Capture360Package()',
      },
    },
  },
};
