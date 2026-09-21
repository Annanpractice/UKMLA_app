#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
NDK="$ANDROID_HOME/ndk/27.2.12479018"
mkdir -p vendor app/src/main/jniLibs/arm64-v8a
fetch() {
 mkdir -p "vendor/$1"
 curl --fail --retry 3 -Ls "https://github.com/$2/archive/$3.tar.gz" | tar xz --strip-components=1 -C "vendor/$1"
}
fetch llama ggml-org/llama.cpp ec91ab5add06555970f98d9c5361d884f3f530f8
fetch vulkan KhronosGroup/Vulkan-Headers 217e93c664ec6704ec2d8c36fa116c1a4a1e2d40
fetch spirv KhronosGroup/SPIRV-Headers 1c6bb2743599e6eb6f37b2969acc0aef812e32e3
fetch opencl KhronosGroup/OpenCL-Headers 386ca390b2f52efeb3e1a55a500690eb8013f60e
fetch loader KhronosGroup/OpenCL-ICD-Loader f27c925e782499eebc4df20e121144358ccd5ac6
# Link against the Android vendor SONAME, never Linux's libOpenCL.so.1.
printf '\nset_target_properties(OpenCL PROPERTIES VERSION "" SOVERSION "")\n' >> vendor/loader/CMakeLists.txt
COMMON=(-G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_TOOLCHAIN_FILE="$NDK/build/cmake/android.toolchain.cmake" -DANDROID_ABI=arm64-v8a -DANDROID_PLATFORM=android-28 -DANDROID_STL=c++_static -DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON)
cmake -S vendor/loader -B vendor/loader-build "${COMMON[@]}" -DOPENCL_ICD_LOADER_HEADERS_DIR="$ROOT/vendor/opencl" -DBUILD_TESTING=OFF
cmake --build vendor/loader-build -j2
OPENCL_LIB=$(find "$ROOT/vendor/loader-build" -name libOpenCL.so -print -quit)
test -n "$OPENCL_LIB"
SPIRV_CONFIG=$(dirname "$(find /usr -name SPIRV-HeadersConfig.cmake -print -quit)")
for backend in cpu opencl vulkan; do
 cmake -S app/src/main/cpp -B "vendor/build-$backend" "${COMMON[@]}" \
  -DPROBE_BACKEND="$backend" -DLLAMA_SOURCE="$ROOT/vendor/llama" \
  -DOpenCL_INCLUDE_DIR="$ROOT/vendor/opencl" -DOpenCL_LIBRARY="$OPENCL_LIB" \
  -DSPIRV-Headers_DIR="$SPIRV_CONFIG" -DSPIRV_INCLUDE_DIR="$ROOT/vendor/spirv/include" \
  -DVulkan_INCLUDE_DIR="$ROOT/vendor/vulkan/include" \
  -DVulkan_LIBRARY="$NDK/toolchains/llvm/prebuilt/linux-x86_64/sysroot/usr/lib/aarch64-linux-android/28/libvulkan.so" \
  -DVulkan_GLSLC_EXECUTABLE="$(command -v glslc)"
 cmake --build "vendor/build-$backend" --target "probe_$backend" -j2
 cp "vendor/build-$backend/libprobe_$backend.so" app/src/main/jniLibs/arm64-v8a/
done
"$NDK/toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-readelf" -d app/src/main/jniLibs/arm64-v8a/libprobe_opencl.so | grep -F 'Shared library: [libOpenCL.so]'
# Do not package the link-time ICD loader: Android supplies the optional vendor libOpenCL.so.
mkdir -p app/src/main/assets/licenses
cp vendor/llama/LICENSE app/src/main/assets/licenses/llama-MIT.txt
cp vendor/vulkan/LICENSE.md app/src/main/assets/licenses/Vulkan-Headers.txt
cp vendor/opencl/LICENSE app/src/main/assets/licenses/OpenCL-Headers.txt
