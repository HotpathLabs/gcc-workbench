N = 50000

print('#include <stdio.h>')
print()

for i in range(N):
    print(f'int global_{i} = {i};')
    print('__attribute__((noinline))')
    print(f'int func_{i}(int x) {{ return x + global_{i}; }}')
    print()

print('int main(void)')
print('{')
print('    long long sum = 0;')

for i in range(N):
    print(f'    sum += func_{i}(1);')

print('    printf("%lld\\n", sum);')
print('    return 0;')
print('}')
