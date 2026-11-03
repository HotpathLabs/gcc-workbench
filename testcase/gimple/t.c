#include <stdlib.h>
#include <string.h>
int g;
struct S { int a; float b; };
static int sq (int x) { return x * x; }
int loop (int *a, int n)
{
  int s = 0;
  for (int i = 0; i < n; i++)
    s += a[i];
  return s;
}
int sw (int k, int y)
{
  switch (k) {
    case 0: y += 3; break;
    case 1: y *= 7; break;
    case 2: y -= 11; break;
    case 5: return 9;
    default: y = sq (y);
  }
  return y;
}
int addr (int v)
{
  int tmp_1 = v;          /* user name that looks like an SSA name */
  int *p = &tmp_1;
  *p += g;
  struct S s;
  s.a = v; s.b = v * 2.0f;
  return tmp_1 + s.a + (int) s.b;
}
int nr (int x)
{
  if (x < 0)
    abort ();
  if (x > 100)
    __builtin_unreachable ();
  return x + 1;
}
void cpy (char *d, const char *src, size_t n)
{
  if (n)
    memcpy (d, src, n);
  g = strlen (d);
}
int vec (int *restrict a, int *restrict b, int n)
{
  int s = 0;
  for (int i = 0; i < n; i++) { a[i] = b[i] * 3; s ^= a[i]; }
  return s;
}
int unin (int c)
{
  int u;
  if (c) u = 4;
  return u;
}
_Complex double cx (_Complex double z) { return z * z + 1.0; }
