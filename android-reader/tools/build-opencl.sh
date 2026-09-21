#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
NDK="$ANDROID_HOME/ndk/27.2.12479018"
CMAKE="$ANDROID_HOME/cmake/3.22.1/bin/cmake"
NINJA="$ANDROID_HOME/cmake/3.22.1/bin/ninja"
mkdir -p vendor app/src/main/jniLibs/arm64-v8a

fetch() {
  local dir="$1" repo="$2" sha="$3"
  rm -rf "vendor/$dir"
  mkdir -p "vendor/$dir"
  curl --fail --retry 3 -Ls "https://github.com/$repo/archive/$sha.tar.gz" | tar xz --strip-components=1 -C "vendor/$dir"
}

fetch opencl KhronosGroup/OpenCL-Headers 386ca390b2f52efeb3e1a55a500690eb8013f60e
fetch loader KhronosGroup/OpenCL-ICD-Loader f27c925e782499eebc4df20e121144358ccd5ac6
printf '\nset_target_properties(OpenCL PROPERTIES VERSION "" SOVERSION "")\n' >> vendor/loader/CMakeLists.txt

COMMON=(-G Ninja -DCMAKE_BUILD_TYPE=Release
  -DCMAKE_TOOLCHAIN_FILE="$NDK/build/cmake/android.toolchain.cmake"
  -DCMAKE_MAKE_PROGRAM="$NINJA"
  -DANDROID_ABI=arm64-v8a
  -DANDROID_PLATFORM=android-28
  -DANDROID_STL=c++_static
  -DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON)

"$CMAKE" -S vendor/loader -B vendor/loader-build "${COMMON[@]}"   -DOPENCL_ICD_LOADER_HEADERS_DIR="$ROOT/vendor/opencl" -DBUILD_TESTING=OFF
"$CMAKE" --build vendor/loader-build -j2
OPENCL_LIB=$(find "$ROOT/vendor/loader-build" -name libOpenCL.so -print -quit)
test -n "$OPENCL_LIB"
test -d "$ROOT/vendor/llama.cpp"

"$CMAKE" -S app/src/main/cpp/opencl -B vendor/build-reader-opencl "${COMMON[@]}"   -DLLAMA_SOURCE="$ROOT/vendor/llama.cpp"   -DOpenCL_INCLUDE_DIR="$ROOT/vendor/opencl"   -DOpenCL_LIBRARY="$OPENCL_LIB"
"$CMAKE" --build vendor/build-reader-opencl --target reader_opencl -j2
cp vendor/build-reader-opencl/libreader_opencl.so app/src/main/jniLibs/arm64-v8a/

"$NDK/toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-readelf" -d app/src/main/jniLibs/arm64-v8a/libreader_opencl.so | grep -F 'Shared library: [libOpenCL.so]'
if find app/src/main/jniLibs -name 'libOpenCL.so' -print -quit | grep -q .; then
  echo "Do not package the link-time OpenCL loader" >&2
  exit 1
fi
