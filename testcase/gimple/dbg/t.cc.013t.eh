
;; Function use (_Z3useRSt6vectorIiSaIiEEi, funcdef_no=1276, decl_uid=26644, cgraph_uid=152, symbol_order=168)

int use (struct vector & v, int x)
Eh tree:
   4 must_not_throw
   1 cleanup land:{2,<D.28509>}
     3 cleanup
     2 try land:{1,<D.28508>} catch:{lab:<D.28507>;}
{
  int r;
  struct K k;
  int D.28504;

  # DEBUG BEGIN_STMT
  k.v = x;
  # DEBUG BEGIN_STMT
  _1 = ns::K::get (&k);
  _2 = add<int> (_1, 1);
  r = _2;
  # DEBUG BEGIN_STMT
  # DEBUG BEGIN_STMT
  [LP 1] std::vector<int>::push_back (v, &r);
  # DEBUG BEGIN_STMT
  _4 = std::vector<int>::size (v);
  _5 = (int) _4;
  r.0_6 = r;
  D.28504 = _5 + r.0_6;
  goto <D.28510>;
  <D.28510>:
  k = {CLOBBER(eos)};
  r = {CLOBBER(eos)};
  goto <D.28505>;
  <D.28505>:
  return D.28504;
  <D.28508>: [LP 1]
  eh_dispatch 2
  [LP 2] resx 2
  <D.28507>:
  _3 = __builtin_eh_pointer (2);
  __cxa_begin_catch (_3);
  # DEBUG BEGIN_STMT
  D.28504 = -1;
  goto <D.28506>;
  <D.28506>:
  [LP 2] __cxa_end_catch ();
  goto <D.28510>;
  <D.28509>: [LP 2]
  k = {CLOBBER(eos)};
  r = {CLOBBER(eos)};
  resx 1
}



;; Function ns::K::get (_ZNK2ns1K3getEv, funcdef_no=1275, decl_uid=26637, cgraph_uid=151, symbol_order=167)

int ns::K::get (const struct K * const this)
{
  int D.28512;

  # DEBUG BEGIN_STMT
  _1 = this->v;
  D.28512 = _1 * 2;
  goto <D.28513>;
  <D.28513>:
  return D.28512;
}



;; Function add<int> (_Z3addIiET_S0_S0_, funcdef_no=1279, decl_uid=26681, cgraph_uid=155, symbol_order=171)

int add<int> (int a, int b)
{
  int D.28514;

  D.28514 = a + b;
  goto <D.28515>;
  <D.28515>:
  return D.28514;
}



;; Function std::vector<int>::push_back (_ZNSt6vectorIiSaIiEE9push_backERKi, funcdef_no=1280, decl_uid=27423, cgraph_uid=158, symbol_order=175)

void std::vector<int>::push_back (struct vector * const this, const value_type & __x)
{
  _1 = this->D.27784._M_impl.D.27078._M_finish;
  _2 = this->D.27784._M_impl.D.27078._M_end_of_storage;
  if (_1 != _2) goto <D.28516>; else goto <D.28517>;
  <D.28516>:
  _3 = &this->D.27784._M_impl;
  _4 = this->D.27784._M_impl.D.27078._M_finish;
  std::allocator_traits<std::allocator<int> >::construct<int, const int&> (_3, _4, __x);
  _5 = this->D.27784._M_impl.D.27078._M_finish;
  _6 = _5 + 4;
  this->D.27784._M_impl.D.27078._M_finish = _6;
  goto <D.28518>;
  <D.28517>:
  std::vector<int>::_M_realloc_append<const int&> (this, __x);
  <D.28518>:
  return;
}



;; Function std::allocator_traits<std::allocator<int> >::construct<int, const int&> (_ZNSt16allocator_traitsISaIiEE9constructIiJRKiEEEvRS0_PT_DpOT0_, funcdef_no=1284, decl_uid=27838, cgraph_uid=160, symbol_order=177)

__attribute__((always_inline))
void std::allocator_traits<std::allocator<int> >::construct<int, const int&> (struct allocator_type & __a, int * __p, const int & __args#0)
Eh tree:
   1 must_not_throw
{
  std::__new_allocator<int>::construct<int, const int&> (__a, __p, __args#0);
  return;
}



;; Function std::__new_allocator<int>::construct<int, const int&> (_ZNSt15__new_allocatorIiE9constructIiJRKiEEEvPT_DpOT0_, funcdef_no=1296, decl_uid=27854, cgraph_uid=172, symbol_order=189)

__attribute__((always_inline))
void std::__new_allocator<int>::construct<int, const int&> (struct __new_allocator * const this, int * __p, const int & __args#0)
Eh tree:
   1 must_not_throw
{
  bool D.28401;
  void * D.28400;
  void * D.28399;

  D.28399 = __p;
  D.28400 = operator new (4, D.28399);
  D.28401 = 1;
  _1 = MEM[(const type &)__args#0];
  MEM[(int *)D.28400] = _1;
  D.28401 = 0;
  if (D.28401 != 0) goto <D.28519>; else goto <D.28520>;
  <D.28519>:
  operator delete (D.28400, D.28399);
  goto <D.28521>;
  <D.28520>:
  <D.28521>:
  return;
}



;; Function operator new (_ZnwmPv, funcdef_no=392, decl_uid=14291, cgraph_uid=39, symbol_order=50)

__attribute__((nodiscard))
void * operator new (size_t D.14289, void * __p)
Eh tree:
   1 must_not_throw
{
  void * D.28522;

  # DEBUG BEGIN_STMT
  D.28522 = __p;
  goto <D.28523>;
  __builtin_unreachable ();
  <D.28523>:
  return D.28522;
}



;; Function operator delete (_ZdlPvS_, funcdef_no=394, decl_uid=14299, cgraph_uid=41, symbol_order=52)

void operator delete (void * D.14297, void * D.14298)
Eh tree:
   1 must_not_throw
{
  return;
}



;; Function std::vector<int>::_M_realloc_append<const int&> (_ZNSt6vectorIiSaIiEE17_M_realloc_appendIJRKiEEEvDpOT_, funcdef_no=1285, decl_uid=27954, cgraph_uid=170, symbol_order=187)

void std::vector<int>::_M_realloc_append<const int&> (struct vector * const this, const int & __args#0)
Eh tree:
   3 cleanup
     4 cleanup
   1 cleanup
     2 cleanup
{
  int * D.28527;
  const size_type D.28526;
  struct _Guard __guard;
  int * __new_finish;
  int * __new_start;
  const size_type __elems;
  int * __old_finish;
  int * __old_start;
  const size_type __len;
  struct iterator D.28073;
  struct iterator D.28063;

  D.28526 = std::vector<int>::_M_check_len (this, 1, "vector::_M_realloc_append");
  __len = D.28526;
  if (__len == 0) goto <D.28524>; else goto <D.28525>;
  <D.28524>:
  __builtin_unreachable ();
  <D.28525>:
  __old_start = this->D.27784._M_impl.D.27078._M_start;
  __old_finish = this->D.27784._M_impl.D.27078._M_finish;
  D.28063 = std::vector<int>::end (this);
  D.28073 = std::vector<int>::begin (this);
  _1 = __gnu_cxx::operator-<int*, std::vector<int> > (&D.28063, &D.28073);
  __elems = (const size_type) _1;
  D.28073 = {CLOBBER(eos)};
  D.28063 = {CLOBBER(eos)};
  _2 = &this->D.27784;
  D.28527 = std::_Vector_base<int, std::allocator<int> >::_M_allocate (_2, __len);
  __new_start = D.28527;
  __new_finish = __new_start;
  _3 = &this->D.27784._M_impl;
  std::vector<int>::_M_realloc_append<const int&>(const int&)::_Guard::_Guard (&__guard, __new_start, __len, _3);
  _4 = &this->D.27784._M_impl;
  _5 = __elems * 4;
  _6 = __new_start + _5;
  _7 = std::__to_address<int> (_6);
  std::allocator_traits<std::allocator<int> >::construct<int, const int&> (_4, _7, __args#0);
  _8 = &this->D.27784;
  _9 = std::_Vector_base<int, std::allocator<int> >::_M_get_Tp_allocator (_8);
  __new_finish = std::vector<int>::_S_relocate (__old_start, __old_finish, __new_start, _9);
  __new_finish = __new_finish + 4;
  __guard._M_storage = __old_start;
  _10 = this->D.27784._M_impl.D.27078._M_end_of_storage;
  _11 = _10 - __old_start;
  _12 = _11 /[ex] 4;
  _13 = (long unsigned int) _12;
  __guard._M_len = _13;
  std::vector<int>::_M_realloc_append<const int&>(const int&)::_Guard::~_Guard (&__guard);
  __guard = {CLOBBER(eos)};
  this->D.27784._M_impl.D.27078._M_start = __new_start;
  this->D.27784._M_impl.D.27078._M_finish = __new_finish;
  _14 = __len * 4;
  _15 = __new_start + _14;
  this->D.27784._M_impl.D.27078._M_end_of_storage = _15;
  return;
}



;; Function std::vector<int>::_M_check_len (_ZNKSt6vectorIiSaIiEE12_M_check_lenEmPKc, funcdef_no=1297, decl_uid=27631, cgraph_uid=173, symbol_order=190)

size_type std::vector<int>::_M_check_len (const struct vector * const this, size_type __n, const char * __s)
Eh tree:
   1 cleanup
{
  const size_type __len;
  size_type iftmp.3;
  size_type D.28531;
  const long unsigned int D.28409;
  bool retval.1;

  _1 = std::vector<int>::max_size (this);
  _2 = std::vector<int>::size (this);
  _3 = _1 - _2;
  __n.2_4 = __n;
  retval.1 = _3 < __n.2_4;
  if (retval.1 != 0) goto <D.28529>; else goto <D.28530>;
  <D.28529>:
  std::__throw_length_error (__s);
  <D.28530>:
  _5 = std::vector<int>::size (this);
  _6 = std::vector<int>::size (this);
  D.28409 = _6;
  _7 = std::max<long unsigned int> (&D.28409, &__n);
  _8 = *_7;
  __len = _5 + _8;
  D.28409 = {CLOBBER(eos)};
  _9 = std::vector<int>::size (this);
  if (__len < _9) goto <D.28533>; else goto <D.28536>;
  <D.28536>:
  _10 = std::vector<int>::max_size (this);
  if (__len > _10) goto <D.28533>; else goto <D.28534>;
  <D.28533>:
  iftmp.3 = std::vector<int>::max_size (this);
  goto <D.28535>;
  <D.28534>:
  iftmp.3 = __len;
  <D.28535>:
  D.28531 = iftmp.3;
  goto <D.28537>;
  <D.28537>:
  return D.28531;
}



;; Function std::max<long unsigned int> (_ZSt3maxImERKT_S2_S2_, funcdef_no=1307, decl_uid=28406, cgraph_uid=183, symbol_order=200)

__attribute__((nodiscard))
const long unsigned int & std::max<long unsigned int> (const long unsigned int & __a, const long unsigned int & __b)
{
  const long unsigned int & D.28540;

  _1 = *__a;
  _2 = *__b;
  if (_1 < _2) goto <D.28538>; else goto <D.28539>;
  <D.28538>:
  D.28540 = __b;
  // predicted unlikely by early return (on trees) predictor.
  goto <D.28541>;
  <D.28539>:
  D.28540 = __a;
  goto <D.28541>;
  <D.28541>:
  return D.28540;
}



;; Function std::vector<int>::max_size (_ZNKSt6vectorIiSaIiEE8max_sizeEv, funcdef_no=1306, decl_uid=27378, cgraph_uid=182, symbol_order=199)

__attribute__((nodiscard))
size_type std::vector<int>::max_size (const struct vector * const this)
Eh tree:
   1 must_not_throw
{
  size_type D.28542;

  _1 = &this->D.27784;
  _2 = std::_Vector_base<int, std::allocator<int> >::_M_get_Tp_allocator (_1);
  D.28542 = std::vector<int>::_S_max_size (_2);
  goto <D.28543>;
  __builtin_unreachable ();
  <D.28543>:
  return D.28542;
}



;; Function std::_Vector_base<int, std::allocator<int> >::_M_get_Tp_allocator (_ZNKSt12_Vector_baseIiSaIiEE19_M_get_Tp_allocatorEv, funcdef_no=1317, decl_uid=26968, cgraph_uid=193, symbol_order=210)

const struct _Tp_alloc_type & std::_Vector_base<int, std::allocator<int> >::_M_get_Tp_allocator (const struct _Vector_base * const this)
Eh tree:
   1 must_not_throw
{
  const struct _Tp_alloc_type & D.28544;

  D.28544 = &this->_M_impl;
  goto <D.28545>;
  __builtin_unreachable ();
  <D.28545>:
  return D.28544;
}



;; Function std::vector<int>::_S_max_size (_ZNSt6vectorIiSaIiEE11_S_max_sizeERKS0_, funcdef_no=1315, decl_uid=27638, cgraph_uid=192, symbol_order=209)

size_type std::vector<int>::_S_max_size (const struct _Tp_alloc_type & __a)
Eh tree:
   1 must_not_throw
{
  const size_t __allocmax;
  const size_t __diffmax;
  size_type D.28546;

  __diffmax = 2305843009213693951;
  _1 = std::allocator_traits<std::allocator<int> >::max_size (__a);
  __allocmax = _1;
  _2 = std::min<long unsigned int> (&__diffmax, &__allocmax);
  D.28546 = *_2;
  goto <D.28548>;
  <D.28548>:
  __diffmax = {CLOBBER(eos)};
  __allocmax = {CLOBBER(eos)};
  goto <D.28547>;
  __builtin_unreachable ();
  <D.28547>:
  return D.28546;
}



;; Function std::allocator_traits<std::allocator<int> >::max_size (_ZNSt16allocator_traitsISaIiEE8max_sizeERKS0_, funcdef_no=1321, decl_uid=26897, cgraph_uid=197, symbol_order=214)

__attribute__((always_inline))
size_type std::allocator_traits<std::allocator<int> >::max_size (const struct allocator_type & __a)
Eh tree:
   1 must_not_throw
{
  size_type D.28549;

  D.28549 = std::__new_allocator<int>::max_size (__a);
  goto <D.28550>;
  __builtin_unreachable ();
  <D.28550>:
  return D.28549;
}



;; Function std::__new_allocator<int>::max_size (_ZNKSt15__new_allocatorIiE8max_sizeEv, funcdef_no=1323, decl_uid=26734, cgraph_uid=199, symbol_order=216)

__attribute__((always_inline))
size_type std::__new_allocator<int>::max_size (const struct __new_allocator * const this)
Eh tree:
   1 must_not_throw
{
  size_type D.28551;

  D.28551 = std::__new_allocator<int>::_M_max_size (this);
  goto <D.28552>;
  __builtin_unreachable ();
  <D.28552>:
  return D.28551;
}



;; Function std::__new_allocator<int>::_M_max_size (_ZNKSt15__new_allocatorIiE11_M_max_sizeEv, funcdef_no=1322, decl_uid=26753, cgraph_uid=198, symbol_order=215)

__attribute__((always_inline))
size_type std::__new_allocator<int>::_M_max_size (const struct __new_allocator * const this)
Eh tree:
   1 must_not_throw
{
  size_type D.28553;

  D.28553 = 2305843009213693951;
  goto <D.28554>;
  __builtin_unreachable ();
  <D.28554>:
  return D.28553;
}



;; Function std::min<long unsigned int> (_ZSt3minImERKT_S2_S2_, funcdef_no=1316, decl_uid=13642, cgraph_uid=191, symbol_order=208)

__attribute__((nodiscard))
const long unsigned int & std::min<long unsigned int> (const long unsigned int & __a, const long unsigned int & __b)
{
  const long unsigned int & D.28557;

  _1 = *__b;
  _2 = *__a;
  if (_1 < _2) goto <D.28555>; else goto <D.28556>;
  <D.28555>:
  D.28557 = __b;
  // predicted unlikely by early return (on trees) predictor.
  goto <D.28558>;
  <D.28556>:
  D.28557 = __a;
  goto <D.28558>;
  <D.28558>:
  return D.28557;
}



;; Function std::vector<int>::end (_ZNSt6vectorIiSaIiEE3endEv, funcdef_no=1298, decl_uid=27356, cgraph_uid=174, symbol_order=191)

__attribute__((nodiscard))
struct iterator std::vector<int>::end (struct vector * const this)
Eh tree:
   1 must_not_throw
{
  struct iterator D.28429;
  struct iterator D.28559;

  _1 = &this->D.27784._M_impl.D.27078._M_finish;
  __gnu_cxx::__normal_iterator<int*, std::vector<int> >::__normal_iterator (&D.28429, _1);
  D.28559 = D.28429;
  goto <D.28561>;
  <D.28561>:
  D.28429 = {CLOBBER(eos)};
  goto <D.28560>;
  __builtin_unreachable ();
  <D.28560>:
  return D.28559;
}



;; Function __gnu_cxx::__normal_iterator<int*, std::vector<int> >::__normal_iterator (_ZN9__gnu_cxx17__normal_iteratorIPiSt6vectorIiSaIiEEEC1ERKS1_, funcdef_no=1310, decl_uid=28051, cgraph_uid=186, symbol_order=203)

void __gnu_cxx::__normal_iterator<int*, std::vector<int> >::__normal_iterator (struct __normal_iterator * const this, int * const & __i)
Eh tree:
   1 must_not_throw
{
  *this = {CLOBBER(bob)};
  _1 = *__i;
  this->_M_current = _1;
  return;
}



;; Function std::vector<int>::begin (_ZNSt6vectorIiSaIiEE5beginEv, funcdef_no=1299, decl_uid=27352, cgraph_uid=175, symbol_order=192)

__attribute__((nodiscard))
struct iterator std::vector<int>::begin (struct vector * const this)
Eh tree:
   1 must_not_throw
{
  struct iterator D.28431;
  struct iterator D.28562;

  _1 = &this->D.27784._M_impl.D.27078._M_start;
  __gnu_cxx::__normal_iterator<int*, std::vector<int> >::__normal_iterator (&D.28431, _1);
  D.28562 = D.28431;
  goto <D.28564>;
  <D.28564>:
  D.28431 = {CLOBBER(eos)};
  goto <D.28563>;
  __builtin_unreachable ();
  <D.28563>:
  return D.28562;
}



;; Function __gnu_cxx::operator-<int*, std::vector<int> > (_ZN9__gnu_cxxmiIPiSt6vectorIiSaIiEEEENS_17__normal_iteratorIT_T0_E15difference_typeERKS8_SB_, funcdef_no=1300, decl_uid=28074, cgraph_uid=176, symbol_order=193)

__attribute__((nodiscard))
difference_type __gnu_cxx::operator-<int*, std::vector<int> > (const struct __normal_iterator & __lhs, const struct __normal_iterator & __rhs)
Eh tree:
   1 must_not_throw
{
  difference_type D.28565;

  _1 = __gnu_cxx::__normal_iterator<int*, std::vector<int> >::base (__lhs);
  _2 = *_1;
  _3 = __gnu_cxx::__normal_iterator<int*, std::vector<int> >::base (__rhs);
  _4 = *_3;
  _5 = _2 - _4;
  D.28565 = _5 /[ex] 4;
  goto <D.28566>;
  __builtin_unreachable ();
  <D.28566>:
  return D.28565;
}



;; Function __gnu_cxx::__normal_iterator<int*, std::vector<int> >::base (_ZNK9__gnu_cxx17__normal_iteratorIPiSt6vectorIiSaIiEEE4baseEv, funcdef_no=1311, decl_uid=28041, cgraph_uid=187, symbol_order=204)

int * const & __gnu_cxx::__normal_iterator<int*, std::vector<int> >::base (const struct __normal_iterator * const this)
Eh tree:
   1 must_not_throw
{
  int * const & D.28567;

  D.28567 = &this->_M_current;
  goto <D.28568>;
  __builtin_unreachable ();
  <D.28568>:
  return D.28567;
}



;; Function std::_Vector_base<int, std::allocator<int> >::_M_allocate (_ZNSt12_Vector_baseIiSaIiEE11_M_allocateEm, funcdef_no=1301, decl_uid=27082, cgraph_uid=177, symbol_order=194)

int * std::_Vector_base<int, std::allocator<int> >::_M_allocate (struct _Vector_base * const this, size_t __n)
{
  int * D.28575;
  int * iftmp.4;
  int * D.28569;

  if (__n != 0) goto <D.28571>; else goto <D.28572>;
  <D.28571>:
  _1 = &this->_M_impl;
  D.28575 = std::allocator_traits<std::allocator<int> >::allocate (_1, __n);
  iftmp.4 = D.28575;
  goto <D.28573>;
  <D.28572>:
  iftmp.4 = 0B;
  <D.28573>:
  D.28569 = iftmp.4;
  goto <D.28574>;
  <D.28574>:
  return D.28569;
}



;; Function std::allocator_traits<std::allocator<int> >::allocate (_ZNSt16allocator_traitsISaIiEE8allocateERS0_m, funcdef_no=1312, decl_uid=26874, cgraph_uid=188, symbol_order=205)

__attribute__((always_inline, nodiscard))
int * std::allocator_traits<std::allocator<int> >::allocate (struct allocator_type & __a, size_type __n)
{
  int * D.28578;
  int * D.28576;

  D.28578 = std::__new_allocator<int>::allocate (__a, __n, 0B);
  D.28576 = D.28578;
  goto <D.28577>;
  <D.28577>:
  return D.28576;
}



;; Function std::__new_allocator<int>::allocate (_ZNSt15__new_allocatorIiE8allocateEmPKv, funcdef_no=1318, decl_uid=26726, cgraph_uid=194, symbol_order=211)

__attribute__((nodiscard))
int * std::__new_allocator<int>::allocate (struct __new_allocator * const this, size_type __n, const void * D.28487)
{
  int * D.28589;
  int * D.28588;
  align_val_t __al;
  int * D.28586;
  bool retval.5;

  _1 = std::__new_allocator<int>::_M_max_size (this);
  _2 = __n > _1;
  _3 = (long int) _2;
  _4 = __builtin_expect (_3, 0);
  retval.5 = _4 != 0;
  if (retval.5 != 0) goto <D.28580>; else goto <D.28581>;
  <D.28580>:
  if (__n > 4611686018427387903) goto <D.28582>; else goto <D.28583>;
  <D.28582>:
  std::__throw_bad_array_new_length ();
  <D.28583>:
  std::__throw_bad_alloc ();
  <D.28581>:
  if (0 != 0) goto <D.28584>; else goto <D.28585>;
  <D.28584>:
  __al = 4;
  _5 = __n * 4;
  D.28588 = operator new (_5, __al);
  D.28586 = D.28588;
  goto <D.28587>;
  <D.28585>:
  _6 = __n * 4;
  D.28589 = operator new (_6);
  D.28586 = D.28589;
  goto <D.28587>;
  <D.28587>:
  return D.28586;
}



;; Function std::vector<int>::_M_realloc_append<const int&>(const int&)::_Guard::_Guard (_ZZNSt6vectorIiSaIiEE17_M_realloc_appendIJRKiEEEvDpOT_EN6_GuardC1EPimRS0_, funcdef_no=1288, decl_uid=28106, cgraph_uid=163, symbol_order=180)

void std::vector<int>::_M_realloc_append<const int&>(const int&)::_Guard::_Guard (struct _Guard * const this, int * __s, size_type __l, struct _Tp_alloc_type & __a)
{
  *this = {CLOBBER(bob)};
  this->_M_storage = __s;
  this->_M_len = __l;
  this->_M_alloc = __a;
  return;
}



;; Function std::__to_address<int> (_ZSt12__to_addressIiEPT_S1_, funcdef_no=1303, decl_uid=28157, cgraph_uid=179, symbol_order=196)

int * std::__to_address<int> (int * __ptr)
Eh tree:
   1 must_not_throw
{
  int * D.28590;

  D.28590 = __ptr;
  goto <D.28591>;
  __builtin_unreachable ();
  <D.28591>:
  return D.28590;
}



;; Function std::_Vector_base<int, std::allocator<int> >::_M_get_Tp_allocator (_ZNSt12_Vector_baseIiSaIiEE19_M_get_Tp_allocatorEv, funcdef_no=1305, decl_uid=26966, cgraph_uid=181, symbol_order=198)

struct _Tp_alloc_type & std::_Vector_base<int, std::allocator<int> >::_M_get_Tp_allocator (struct _Vector_base * const this)
Eh tree:
   1 must_not_throw
{
  struct _Tp_alloc_type & D.28592;

  D.28592 = &this->_M_impl;
  goto <D.28593>;
  __builtin_unreachable ();
  <D.28593>:
  return D.28592;
}



;; Function std::vector<int>::_S_relocate (_ZNSt6vectorIiSaIiEE11_S_relocateEPiS2_S2_RS0_, funcdef_no=1304, decl_uid=27240, cgraph_uid=180, symbol_order=197)

int * std::vector<int>::_S_relocate (int * __first, int * __last, int * __result, struct _Tp_alloc_type & __alloc)
Eh tree:
   1 must_not_throw
{
  int * D.28594;

  D.28594 = std::__relocate_a<int*, int*, std::allocator<int> > (__first, __last, __result, __alloc);
  goto <D.28595>;
  __builtin_unreachable ();
  <D.28595>:
  return D.28594;
}



;; Function std::__relocate_a<int*, int*, std::allocator<int> > (_ZSt12__relocate_aIPiS0_SaIiEET0_T_S3_S2_RT1_, funcdef_no=1314, decl_uid=28285, cgraph_uid=190, symbol_order=207)

int * std::__relocate_a<int*, int*, std::allocator<int> > (int * __first, int * __last, int * __result, struct allocator & __alloc)
Eh tree:
   1 must_not_throw
{
  int * D.28596;

  _1 = std::__niter_base<int*> (__first);
  _2 = std::__niter_base<int*> (__last);
  _3 = std::__niter_base<int*> (__result);
  D.28596 = std::__relocate_a_1<int, int> (_1, _2, _3, __alloc);
  goto <D.28597>;
  __builtin_unreachable ();
  <D.28597>:
  return D.28596;
}



;; Function std::__niter_base<int*> (_ZSt12__niter_baseIPiET_S1_, funcdef_no=1319, decl_uid=28291, cgraph_uid=195, symbol_order=212)

int * std::__niter_base<int*> (int * __it)
Eh tree:
   1 must_not_throw
{
  int * D.28598;

  D.28598 = __it;
  goto <D.28599>;
  __builtin_unreachable ();
  <D.28599>:
  return D.28598;
}



;; Function std::__relocate_a_1<int, int> (_ZSt14__relocate_a_1IiiENSt9enable_ifIXsrSt24__is_bitwise_relocatableIT_vE5valueEPS2_E4typeES4_S4_S4_RSaIT0_E, funcdef_no=1320, decl_uid=28380, cgraph_uid=196, symbol_order=213)

int * std::__relocate_a_1<int, int> (int * __first, int * __last, int * __result, struct allocator & __alloc)
Eh tree:
   1 must_not_throw
{
  ptrdiff_t __count;
  int * D.28603;

  _1 = __last - __first;
  __count = _1 /[ex] 4;
  if (__count > 0) goto <D.28600>; else goto <D.28601>;
  <D.28600>:
  __count.6_2 = (long unsigned int) __count;
  _3 = __count.6_2 * 4;
  __builtin_memcpy (__result, __first, _3);
  goto <D.28602>;
  <D.28601>:
  <D.28602>:
  __count.7_4 = (long unsigned int) __count;
  _5 = __count.7_4 * 4;
  D.28603 = __result + _5;
  goto <D.28604>;
  __builtin_unreachable ();
  <D.28604>:
  return D.28603;
}



;; Function std::vector<int>::_M_realloc_append<const int&>(const int&)::_Guard::~_Guard (_ZZNSt6vectorIiSaIiEE17_M_realloc_appendIJRKiEEEvDpOT_EN6_GuardD1Ev, funcdef_no=1291, decl_uid=28116, cgraph_uid=166, symbol_order=183)

void std::vector<int>::_M_realloc_append<const int&>(const int&)::_Guard::~_Guard (struct _Guard * const this)
Eh tree:
   1 must_not_throw
{
  _1 = this->_M_storage;
  if (_1 != 0B) goto <D.28605>; else goto <D.28606>;
  <D.28605>:
  _2 = this->_M_alloc;
  _3 = this->_M_storage;
  _4 = this->_M_len;
  [MNT 1] std::allocator_traits<std::allocator<int> >::deallocate (_2, _3, _4);
  goto <D.28607>;
  <D.28606>:
  <D.28607>:
  *this = {CLOBBER(eob)};
  return;
}



;; Function std::allocator_traits<std::allocator<int> >::deallocate (_ZNSt16allocator_traitsISaIiEE10deallocateERS0_Pim, funcdef_no=1302, decl_uid=26881, cgraph_uid=178, symbol_order=195)

__attribute__((always_inline))
void std::allocator_traits<std::allocator<int> >::deallocate (struct allocator_type & __a, int * __p, size_type __n)
{
  std::__new_allocator<int>::deallocate (__a, __p, __n);
  return;
}



;; Function std::__new_allocator<int>::deallocate (_ZNSt15__new_allocatorIiE10deallocateEPim, funcdef_no=1313, decl_uid=26730, cgraph_uid=189, symbol_order=206)

void std::__new_allocator<int>::deallocate (struct __new_allocator * const this, int * __p, size_type __n)
{
  if (0 != 0) goto <D.28608>; else goto <D.28609>;
  <D.28608>:
  _1 = __n * 4;
  operator delete (__p, _1, 4);
  // predicted unlikely by early return (on trees) predictor.
  goto <D.28610>;
  <D.28609>:
  _2 = __n * 4;
  operator delete (__p, _2);
  <D.28610>:
  return;
}



;; Function std::vector<int>::size (_ZNKSt6vectorIiSaIiEE4sizeEv, funcdef_no=1283, decl_uid=27376, cgraph_uid=159, symbol_order=176)

__attribute__((nodiscard))
size_type std::vector<int>::size (const struct vector * const this)
Eh tree:
   1 must_not_throw
{
  size_type D.28611;

  _1 = this->D.27784._M_impl.D.27078._M_finish;
  _2 = this->D.27784._M_impl.D.27078._M_start;
  _3 = _1 - _2;
  _4 = _3 /[ex] 4;
  D.28611 = (size_type) _4;
  goto <D.28612>;
  __builtin_unreachable ();
  <D.28612>:
  return D.28611;
}


