/* huge_map_test.c */

#include <stdio.h>

#define GEN_FUNC(N)                           \
    int global_##N = N;                       \
    __attribute__((noinline))                 \
    int func_##N(int x)                       \
    {                                         \
        return x + global_##N;                \
    }

/* Generate many symbols */
GEN_FUNC(0)
GEN_FUNC(1)
GEN_FUNC(2)
GEN_FUNC(3)
GEN_FUNC(4)
GEN_FUNC(5)
GEN_FUNC(6)
GEN_FUNC(7)
GEN_FUNC(8)
GEN_FUNC(9)

/*
 * Continue the pattern up to several thousand.
 *
 * For example:
 * GEN_FUNC(0) ... GEN_FUNC(9999)
 */

int main(void)
{
    long sum = 0;

    sum += func_0(1);
    sum += func_1(1);
    sum += func_2(1);
    sum += func_3(1);
    sum += func_4(1);
    sum += func_5(1);
    sum += func_6(1);
    sum += func_7(1);
    sum += func_8(1);
    sum += func_9(1);

    printf("%ld\n", sum);
    return 0;
}
