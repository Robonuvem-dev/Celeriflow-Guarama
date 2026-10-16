# -*- coding: utf-8 -*-
"""Testes numéricos didáticos 2026, NÃO motor de folha de produção.
Executar: python -m unittest -v teste_calculos_referencia.py
O motor real deve considerar regime, todas as bases/leis, deduções e incidências.
"""
from decimal import Decimal, ROUND_HALF_UP
import unittest

D=lambda x:Decimal(str(x))
CENTAVO=D('0.01')
def centavos(x):return x.quantize(CENTAVO,rounding=ROUND_HALF_UP)

def ats_quinq(vencimento,anos_efetivos):
    quinquenios=int(anos_efetivos)//5
    return centavos(D(vencimento)*min(D(quinquenios)*D('0.05'),D('0.30')))

def inss_rgps_2026(base):
    # Para empregados abrangidos pela tabela progressiva 2026; não usar para RPPS.
    b=min(max(D(base),D(0)),D('8475.55'))
    faixas=[(D('1621.00'),D('.075')),(D('2902.84'),D('.09')),(D('4354.27'),D('.12')),(D('8475.55'),D('.14'))]
    prev=D('0');total=D('0')
    for teto,aliquota in faixas:
        fatia=max(D('0'),min(b,teto)-prev)
        total+=fatia*aliquota
        prev=teto
    return centavos(total)

def irrf2026_demonstracao(rendimento_tributavel,previdencia_legal=0,outras_deducoes_legais=0):
    # Simplificação controlada para renda sujeita ao ajuste; NÃO cobre RRA, 13°, pensão,
    # dependentes, diversas deduções e particularidades nem procedimentos reais de retenção.
    r=D(rendimento_tributavel)
    legal=D(previdencia_legal)+D(outras_deducoes_legais)
    simplificada=D('607.20')
    base=max(D('0'),r-max(legal,simplificada))
    faixas=[(D('2428.80'),D('0'),D('0')),
            (D('2826.65'),D('0.075'),D('182.16')),
            (D('3751.05'),D('0.15'),D('394.16')),
            (D('4664.68'),D('0.225'),D('675.49')),
            (D('999999999'),D('0.275'),D('908.73'))]
    ir_preliminar=D('0')
    for teto,taxa,ded in faixas:
        if base<=teto:
            ir_preliminar=max(D('0'),centavos(base*taxa-ded));break
    if r<=D('5000'):
        reducao=min(ir_preliminar,D('312.89'))
    elif r<=D('7350'):
        reducao=min(ir_preliminar,max(D('0'),centavos(D('978.62')-D('0.133145')*r)))
    else:
        reducao=D('0')
    return {'base_irrf':centavos(base),'imposto_preliminar':ir_preliminar,'reducao':reducao,'irrf':max(D('0'),ir_preliminar-reducao)}

class TestReferencia(unittest.TestCase):
    def test_ats_10_anos(self):self.assertEqual(ats_quinq(4000,10),D('400.00'))
    def test_ats_teto_35_anos(self):self.assertEqual(ats_quinq(4000,35),D('1200.00'))
    def test_ats_incompleto(self):self.assertEqual(ats_quinq(4000,4),D('0.00'))
    def test_inss_4400(self):self.assertEqual(inss_rgps_2026(4400),D('417.51'))
    def test_inss_1621(self):self.assertEqual(inss_rgps_2026(1621),D('121.58'))
    def test_terco_ferias(self):self.assertEqual(centavos(D('4400')/3),D('1466.67'))
    def test_13_8_avos(self):self.assertEqual(centavos(D('4400')*D(8)/D(12)),D('2933.33'))
    def test_extras_50(self):self.assertEqual(centavos(D('20')*2*(D(1)+D('.5'))),D('60.00'))
    def test_extras_100(self):self.assertEqual(centavos(D('20')*2*(D(1)+D('1'))),D('80.00'))
    def test_noturno_hora_reduzida(self):self.assertEqual(D('420')/D('52.5'),D('8'))
    def test_irrf_5000_receita(self):
        r=irrf2026_demonstracao(5000,509.60)
        self.assertEqual(r['base_irrf'],D('4392.80'))
        self.assertEqual(r['imposto_preliminar'],D('312.89'))
        self.assertEqual(r['reducao'],D('312.89'))
        self.assertEqual(r['irrf'],D('0'))

if __name__=='__main__':unittest.main()
