#include <stdio.h>
#include <stdlib.h>
#include <string.h>

volatile int sink;

typedef struct {
    char data[2048];
    long long vals[128];
} large_t;

__attribute__((noinline))
int leaf_small(int x)
{
    char buf[64];
    memset(buf, x, sizeof(buf));
    sink += buf[0];
    return x;
}

__attribute__((noinline))
int leaf_medium(int x)
{
    char buf[1024];
    memset(buf, x, sizeof(buf));
    sink += buf[0];
    return x;
}

__attribute__((noinline))
int leaf_large(int x)
{
    large_t obj;
    memset(&obj, x, sizeof(obj));
    sink += obj.data[0];
    return x;
}

__attribute__((noinline))
int recursive(int depth, int size)
{
    char local[size];

    memset(local, depth, sizeof(local));
    sink += local[0];

    if (depth == 0)
        return size;

    return recursive(depth - 1, size + 32);
}

__attribute__((noinline))
int mixed_chain(int n)
{
    char frame[512];

    memset(frame, n, sizeof(frame));

    int r = leaf_small(n);

    if (n & 1)
        r += leaf_medium(n);
    else
        r += leaf_large(n);

    return r;
}

typedef int (*fp_t)(int);

__attribute__((noinline))
int indirect_call(int n)
{
    fp_t table[3] = {
        leaf_small,
        leaf_medium,
        leaf_large
    };

    return table[n % 3](n);
}

__attribute__((noinline))
int stress_stack(int n)
{
    char local[4096];

    memset(local, n, sizeof(local));

    int r = mixed_chain(n);

    r += indirect_call(n);

    r += recursive(20, 128);

    return r;
}

int main(int argc, char **argv)
{
    int n = argc > 1 ? atoi(argv[1]) : 100;

    long long sum = 0;

    for (int i = 0; i < n; ++i)
        sum += stress_stack(i);

    printf("%lld\n", sum);

    return 0;
}
